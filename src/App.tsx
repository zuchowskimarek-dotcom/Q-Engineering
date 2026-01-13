import { ChakraProvider } from '@chakra-ui/react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import theme from './theme';
import { MainLayout } from './layout/MainLayout';
import { Dashboard } from './pages/Dashboard';
import { Repositories } from './pages/Repositories';
import { People } from './pages/People';
import { Teams } from './pages/Teams';

function App() {
  return (
    <ChakraProvider theme={theme}>
      <BrowserRouter>
        <MainLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/people" element={<People />} />
            <Route path="/teams" element={<Teams />} />
            <Route path="/repositories" element={<Repositories />} />
          </Routes>
        </MainLayout>
      </BrowserRouter>
    </ChakraProvider>
  );
}

export default App;
