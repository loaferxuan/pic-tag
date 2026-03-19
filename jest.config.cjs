module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-crypto$': '<rootDir>/src/test/mocks/expo-crypto.ts',
    '^expo-file-system/legacy$': '<rootDir>/src/test/mocks/expo-file-system-legacy.ts',
    '^expo-media-library$': '<rootDir>/src/test/mocks/expo-media-library.ts',
    '^expo-sqlite$': '<rootDir>/src/test/mocks/expo-sqlite.ts',
  },
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/shared/utils/**/*.ts', 'src/features/**/*.ts'],
};
