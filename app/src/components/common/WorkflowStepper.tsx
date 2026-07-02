/**
 * WorkflowStepper — Fil d'Ariane horizontal premium (Blue Ice)
 */
import { useNavigate } from 'react-router-dom';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { useAppStore }  from '../../store/useAppStore';
import { WORKFLOW_STEPS } from '../../types';
import type { WorkflowStep } from '../../types';

export function WorkflowStepper() {
  const navigate = useNavigate();
  const { currentStep, completedSteps } = useAppStore((s) => ({
    currentStep:    s.currentStep,
    completedSteps: s.completedSteps,
  }));

  return (
    <header className="flex items-center h-10 px-4 gap-0 bg-navy-850/80 border-b border-navy-400/20 backdrop-blur-sm overflow-x-auto shrink-0">
      {WORKFLOW_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step.id as WorkflowStep);
        const isCurrent   = currentStep === step.id;
        const isClickable = isCompleted || isCurrent;
        const isFuture    = !isCompleted && !isCurrent;

        return (
          <div key={step.id} className="flex items-center shrink-0">
            <button
              disabled={!isClickable}
              onClick={() => isClickable && navigate(`/module/${step.id}`)}
              title={step.description}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1 rounded-md transition-all duration-150 text-xs',
                isCompleted && 'text-emerald-400 hover:bg-emerald-500/8 cursor-pointer',
                isCurrent   && 'text-ice-200 bg-ice-500/10 border border-ice-500/15 cursor-pointer shadow-ice-sm',
                isFuture    && 'text-ice-800/40 cursor-not-allowed',
              )}
            >
              <span className={clsx(
                'w-[18px] h-[18px] rounded flex items-center justify-center font-bold text-[9px] shrink-0',
                isCompleted ? 'bg-emerald-500/15 text-emerald-400'
                  : isCurrent ? 'bg-ice-500/20 text-ice-400'
                  : 'bg-navy-600/50 text-ice-800/50',
              )}>
                {isCompleted ? <Check size={8} strokeWidth={3} /> : step.id}
              </span>
              <span className="hidden sm:inline font-medium text-[11px]">{step.label}</span>
            </button>

            {index < WORKFLOW_STEPS.length - 1 && (
              <div className={clsx(
                'w-6 h-px mx-1',
                isCompleted ? 'bg-emerald-500/30' : 'bg-navy-400/25',
              )} />
            )}
          </div>
        );
      })}
    </header>
  );
}
