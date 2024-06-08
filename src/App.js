import logo from './logo.svg';
import './App.css';
import LexClient from './lib/lex/lexclient';
import awsConfig from './awsConfig';

function App() {
  return (
    <div className="App">
      <header className="App-header">
      <LexClient config={awsConfig} />
      </header>
    </div>
  );
}

export default App;
