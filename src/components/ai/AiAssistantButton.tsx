import { Link, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

/** Floating shortcut to the AI assistant, shown on every page except chats. */
const AiAssistantButton = () => {
  const { pathname } = useLocation();
  const { t } = useLanguage();
  if (pathname.startsWith("/ai-assistant") || pathname.startsWith("/consultation/") || pathname.startsWith("/admin") || pathname.startsWith("/owner") || pathname.startsWith("/e/")) {
    return null;
  }
  return (
    <Link
      to="/ai-assistant"
      aria-label={t("nav.ai")}
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] right-4 sm:right-5 z-40 flex items-center gap-2 rounded-full bg-hero-gradient px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-90"
    >
      <Sparkles className="w-5 h-5" />
      <span className="hidden sm:inline">{t("nav.ai")}</span>
    </Link>
  );
};

export default AiAssistantButton;
