import { Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import Home from './pages/Home';
import Lab from './pages/Lab';
import Discovery from './pages/Discovery';
import Visualizer from './pages/Visualizer';
import Validation from './pages/Validation';
import History from './pages/History';
import Help from './pages/Help';
import { EmptyState } from './components/UI';

export default function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/lab" element={<Lab />} />
        <Route path="/discovery" element={<Discovery />} />
        <Route path="/visualizer" element={<Visualizer />} />
        <Route path="/validation" element={<Validation />} />
        <Route path="/history" element={<History />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<EmptyState title="Page not found" text="That page does not exist." actionLabel="Back to dashboard" to="/" />} />
      </Routes>
    </Layout>
  );
}
