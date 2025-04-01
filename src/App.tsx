import QRScanner from './components/QRScanner';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>QR Code Scanner Application</h1>
      </header>
      <main>
        <QRScanner />
      </main>
    </div>
  );
}

export default App;
