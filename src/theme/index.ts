import { extendTheme, type ThemeConfig } from '@chakra-ui/react';

const config: ThemeConfig = {
    initialColorMode: 'dark',
    useSystemColorMode: false,
};

const theme = extendTheme({
    config,
    fonts: {
        heading: `'Inter', sans-serif`,
        body: `'Inter', sans-serif`,
    },
    colors: {
        brand: {
            50: '#e1f5fe',
            100: '#b3e5fc',
            200: '#81d4fa',
            300: '#4fc3f7',
            400: '#29b6f6',
            500: '#03a9f4',
            600: '#039be5',
            700: '#0288d1',
            800: '#0277bd',
            900: '#01579b',
        },
    },
});

export default theme;
