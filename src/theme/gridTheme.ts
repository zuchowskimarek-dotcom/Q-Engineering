import { themeQuartz } from 'ag-grid-community';

export const gridTheme = themeQuartz.withParams({
    backgroundColor: '#1a202c', // chakra gray.800 approximation
    foregroundColor: '#e2e8f0', // chakra gray.200
    borderColor: '#2d3748',     // chakra gray.700
    accentColor: '#3182ce',      // chakra blue.500 (brand)
});
