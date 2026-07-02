/**
 * jest.config.ts — Configuration Jest pour le backend Express
 */
import type { Config } from 'jest';

const config: Config = {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/src', '<rootDir>/tests'],
  testMatch:           ['**/*.test.ts', '**/*.spec.ts'],
  transform:           { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory:   'coverage',
  coverageReporters:   ['text', 'lcov'],
};

export default config;
