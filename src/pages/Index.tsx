import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import DepartmentsSection from "@/components/DepartmentsSection";
import DoctorsSection from "@/components/DoctorsSection";
import NewsSection from "@/components/NewsSection";
import Footer from "@/components/Footer";
import AiAssistantSection from "@/components/ai/AiAssistantSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <Hero />
      <AiAssistantSection />
      <DepartmentsSection />
      <DoctorsSection />
      <NewsSection />
      <Footer />
    </div>
  );
};

export default Index;
