/**
 * lib.rs — Noyau Tauri de ConvertAlps
 *
 * Responsabilités :
 *   1. Lancement du sidecar Express (backend Node.js) au démarrage
 *   2. Commands Tauri exposées au frontend React
 *   3. Chiffrement local AES-256-GCM des données sensibles d'atelier
 */
#[cfg(not(debug_assertions))]
use tauri::Manager;
#[cfg(not(debug_assertions))]
use tauri_plugin_shell::ShellExt;

// ── Commandes Tauri exposées au frontend ──────────────────────────────────────

/// Chiffrement AES-256-GCM d'une donnée texte brute.
/// Utilisé pour protéger les fichiers G-Code et les données de calibration.
#[tauri::command]
fn encrypt_data(plaintext: &str, key_b64: &str) -> Result<String, String> {
    use aes_gcm::{
        aead::{Aead, KeyInit, OsRng, rand_core::RngCore},
        Aes256Gcm, Key, Nonce,
    };
    use base64::{engine::general_purpose::STANDARD, Engine};

    let key_bytes = STANDARD.decode(key_b64).map_err(|e| e.to_string())?;
    if key_bytes.len() != 32 {
        return Err("Clé AES-256 invalide : doit être 32 octets encodés en Base64".into());
    }

    let key    = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);

    let mut nonce_bytes = [0u8; 12];
    OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, plaintext.as_bytes())
        .map_err(|e| e.to_string())?;

    // Format : nonce_base64.ciphertext_base64
    let result = format!(
        "{}.{}",
        STANDARD.encode(nonce_bytes),
        STANDARD.encode(ciphertext)
    );
    Ok(result)
}

/// Déchiffrement AES-256-GCM.
#[tauri::command]
fn decrypt_data(encrypted: &str, key_b64: &str) -> Result<String, String> {
    use aes_gcm::{
        aead::{Aead, KeyInit},
        Aes256Gcm, Key, Nonce,
    };
    use base64::{engine::general_purpose::STANDARD, Engine};

    let parts: Vec<&str> = encrypted.splitn(2, '.').collect();
    if parts.len() != 2 {
        return Err("Format de données chiffrées invalide".into());
    }

    let nonce_bytes    = STANDARD.decode(parts[0]).map_err(|e| e.to_string())?;
    let ciphertext     = STANDARD.decode(parts[1]).map_err(|e| e.to_string())?;
    let key_bytes      = STANDARD.decode(key_b64).map_err(|e| e.to_string())?;

    let key    = Key::<Aes256Gcm>::from_slice(&key_bytes);
    let cipher = Aes256Gcm::new(key);
    let nonce  = Nonce::from_slice(&nonce_bytes);

    let plaintext = cipher
        .decrypt(nonce, ciphertext.as_ref())
        .map_err(|_| "Déchiffrement échoué : données corrompues ou clé incorrecte".to_string())?;

    String::from_utf8(plaintext).map_err(|e| e.to_string())
}

/// Retourne le port sur lequel le sidecar Express a été démarré.
#[tauri::command]
fn get_backend_port() -> u16 {
    3737
}

// ── Point d'entrée de l'application ──────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .setup(|_app| {
            // ── Lancement du sidecar Express (backend Node.js) ────────────
            // Si le backend écoute déjà sur 3737 (ex. lancé séparément en dev),
            // on ne spawn pas un second processus.
            let backend_already_up = std::net::TcpStream::connect_timeout(
                &"127.0.0.1:3737".parse().unwrap(),
                std::time::Duration::from_millis(150),
            ).is_ok();

            if backend_already_up {
                println!("[ConvertAlps] Backend déjà disponible sur le port 3737 — sidecar ignoré");
            } else {
                // ── Dev : chemin absolu HORS src-tauri/ pour éviter la boucle de rebuild ──
                #[cfg(debug_assertions)]
                {
                    let sidecar_path = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                        .parent().expect("src-tauri parent")
                        .join("backend-sidecar")
                        .join(concat!("backend-server-x86_64-pc-windows-msvc", ".exe"));

                    if sidecar_path.exists() {
                        match std::process::Command::new(&sidecar_path)
                            .env("CONVERTALPS_PORT", "3737")
                            .env("NODE_ENV", "production")
                            .spawn()
                        {
                            Ok(_child) => println!("[ConvertAlps] Sidecar Express démarré sur le port 3737"),
                            Err(e)    => eprintln!("[ConvertAlps] Impossible de démarrer le sidecar (dev) : {}", e),
                        }
                    } else {
                        eprintln!("[ConvertAlps] Sidecar introuvable : {:?}", sidecar_path);
                        eprintln!("[ConvertAlps] Lancez : cd app/backend-express && npm run pkg:win:dev");
                    }
                }

                // ── Production : sidecar Tauri standard ──
                #[cfg(not(debug_assertions))]
                match _app.shell().sidecar("backend-server") {
                    Ok(cmd) => {
                        match cmd
                            .env("CONVERTALPS_PORT", "3737")
                            .env("NODE_ENV", "production")
                            .spawn()
                        {
                            Ok((mut rx, child)) => {
                                println!("[ConvertAlps] Sidecar Express démarré sur le port 3737");
                                tauri::async_runtime::spawn(async move {
                                    while rx.recv().await.is_some() {}
                                });
                                _app.manage(child);
                            }
                            Err(e) => {
                                eprintln!("[ConvertAlps] AVERTISSEMENT : impossible de démarrer le sidecar : {}", e);
                            }
                        }
                    }
                    Err(e) => {
                        eprintln!("[ConvertAlps] Sidecar introuvable (release) : {}", e);
                    }
                }
            }
            Ok(())
        })
        // ── Tuer le sidecar quand la fenêtre principale se ferme ──────────────
        // Indispensable pour que l'installeur NSIS (mise à jour manuelle) puisse
        // écraser backend-server.exe sans erreur «fichier verrouillé».
        // Le handler s'exécute de façon synchrone : taskkill attend la fin avant
        // que le processus Tauri se termine.
        .on_window_event(|window, event| {
            if window.label() == "main" {
                if let tauri::WindowEvent::Destroyed = event {
                    // Production : Tauri strip le triple cible → "backend-server.exe"
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/IM", "backend-server.exe", "/T"])
                        .output();
                    // Dev : binaire avec triple cible complet
                    let _ = std::process::Command::new("taskkill")
                        .args(["/F", "/IM",
                               "backend-server-x86_64-pc-windows-msvc.exe",
                               "/T"])
                        .output();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            encrypt_data,
            decrypt_data,
            get_backend_port,
        ])
        .run(tauri::generate_context!())
        .expect("Erreur fatale au démarrage de l'application Tauri");
}

