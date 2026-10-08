import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import UrgencyBar from './components/UrgencyBar';
import Nav from './components/Nav';
import Hero from './components/Hero';
import Problem from './components/Problem';
import CostOfInaction from './components/CostOfInaction';
import Transformation from './components/Transformation';
import Features from './components/Features';
import HowItWorks from './components/HowItWorks';
import SocialProof from './components/SocialProof';
import Pricing from './components/Pricing';
import FAQ from './components/FAQ';
import FinalCTA from './components/FinalCTA';
import Footer from './components/Footer';

// Public marketing landing — the new "/" route. Unlike the old Index page it
// does NOT force login; anyone can browse. Already-authenticated users get a
// gentle bounce to their dashboard (they don't need the sales pitch), but the
// page renders immediately for everyone else.
//
// Section order (PAS framework): Problem -> Agitate (cost calc) -> Solve
// (transformation, features) -> How -> Proof -> Pricing -> FAQ -> Close.
export default function SalesLanding() {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { hash } = useLocation();

  // Links like /#pricing from other pages (checkout "Pilih plan") land on the section,
  // not the top — the SPA router doesn't scroll to anchors by itself.
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' }), 150);
    return () => clearTimeout(t);
  }, [hash]);

  useEffect(() => {
    if (!isLoading && isAuthenticated) navigate('/dashboard', { replace: true });
  }, [isAuthenticated, isLoading, navigate]);

  useEffect(() => {
    document.title = 'PeningOrder — Mini ERP urus order untuk usahawan online Malaysia';
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = 'Berhenti urus order dalam buku, Excel & WhatsApp. PeningOrder track semua order, kurier, tracking & untung dalam satu dashboard. Bayar bulanan, tiada kontrak.';
  }, []);

  return (
    <div className="bg-white">
      <UrgencyBar />
      <Nav />
      <main>
        <Hero />
        <Problem />
        <CostOfInaction />
        <Transformation />
        <Features />
        <HowItWorks />
        <SocialProof />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}
