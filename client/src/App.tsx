import { BrowserRouter } from "react-router-dom";
import Router from "./routes/router";
import { Header } from "./components/layout/Header";
import { Footer } from "./components/layout/Footer";
import { LogPanel } from "./components/ui/LogPanel"; // <-- Import LogPanel

export default function App() {
  return (
    <BrowserRouter>
      <Header />
      <Router />
      <Footer />
      <LogPanel /> {/* Add the floating log panel */}
    </BrowserRouter>
  );
}