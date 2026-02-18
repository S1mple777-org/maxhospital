import { useLanguage } from "@/contexts/LanguageContext";
import { Stethoscope, Mail, Phone, MapPin } from "lucide-react";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-card border-t border-border py-12">
      <div className="container mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-9 h-9 rounded-lg bg-hero-gradient flex items-center justify-center">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg text-foreground">
                Online Hospital
              </span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t("footer.description")}
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-display font-semibold text-foreground mb-3">
              {t("footer.quickLinks")}
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#home" className="hover:text-primary transition-colors">{t("nav.home")}</a></li>
              <li><a href="#departments" className="hover:text-primary transition-colors">{t("nav.departments")}</a></li>
              <li><a href="#doctors" className="hover:text-primary transition-colors">{t("nav.doctors")}</a></li>
              <li><a href="#news" className="hover:text-primary transition-colors">{t("nav.news")}</a></li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-display font-semibold text-foreground mb-3">
              {t("footer.contact")}
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {t("footer.address")}</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" /> +998 71 123 45 67</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" /> info@onlinehospital.uz</li>
            </ul>
          </div>
        </div>

        <div className="border-t border-border pt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Online Hospital. {t("footer.rights")}.
        </div>
      </div>
    </footer>
  );
};

export default Footer;
