import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { HomePage } from './components/HomePage';
import { CameraPage } from './components/CameraPage';
import { ViewerPage } from './components/ViewerPage';
import '@livekit/components-styles';
import './index.css';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/camera" element={<CameraPage />} />
        <Route path="/viewer" element={<ViewerPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
