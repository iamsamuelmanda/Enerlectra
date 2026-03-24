export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="flex flex-col min-h-screen">
        <Header />
        {/* This "page-container" class from your CSS is the secret sauce */}
        <main className="flex-grow page-container"> 
          <Router />
        </main>
        <Footer />
        <LogPanel />
      </div>
    </BrowserRouter>
  );
}