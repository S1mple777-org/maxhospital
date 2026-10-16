import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ProfilePage from "./pages/ProfilePage";
import AdminPanel from "./pages/AdminPanel";
import OwnerPanel from "./pages/OwnerPanel";
import DepartmentsPage from "./pages/DepartmentsPage";
import DepartmentDetailPage from "./pages/DepartmentDetailPage";
import DoctorsPage from "./pages/DoctorsPage";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import ConsultationPage from "./pages/ConsultationPage";
import DoctorDashboard from "./pages/DoctorDashboard";
import DoctorProfilePage from "./pages/DoctorProfilePage";
import StartConsultation from "./pages/StartConsultation";
import UsersPage from "./pages/UsersPage";
import CreatePrescription from "./pages/CreatePrescription";
import PrescriptionView from "./pages/PrescriptionView";
import MyPrescriptions from "./pages/MyPrescriptions";
import AiAssistantPage from "./pages/AiAssistantPage";
import HealthPage from "./pages/HealthPage";
import AiAssistantButton from "./components/ai/AiAssistantButton";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <LanguageProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<AuthPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/admin" element={<AdminPanel />} />
                <Route path="/owner" element={<OwnerPanel />} />
                <Route path="/departments" element={<DepartmentsPage />} />
                <Route path="/departments/:id" element={<DepartmentDetailPage />} />
                <Route path="/doctors" element={<DoctorsPage />} />
                <Route path="/doctors/:id" element={<DoctorProfilePage />} />
                <Route path="/news" element={<NewsPage />} />
                <Route path="/news/:id" element={<NewsDetailPage />} />
                <Route path="/consultation/:id" element={<ConsultationPage />} />
                <Route path="/doctor-dashboard" element={<DoctorDashboard />} />
                <Route path="/start-consultation" element={<StartConsultation />} />
                <Route path="/users" element={<UsersPage />} />
                <Route path="/create-prescription/:consultationId" element={<CreatePrescription />} />
                <Route path="/prescription/:id" element={<PrescriptionView />} />
                <Route path="/my-prescriptions" element={<MyPrescriptions />} />
                <Route path="/ai-assistant" element={<AiAssistantPage />} />
                <Route path="/health" element={<HealthPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
              <AiAssistantButton />
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </LanguageProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
