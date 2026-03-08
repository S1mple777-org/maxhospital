import { useLanguage } from "@/contexts/LanguageContext";
import { Stethoscope, Mail, Phone, MapPin } from "lucide-react";
import { motion } from "framer-motion";

const Footer = () => {
  const { t } = useLanguage();

  return (
    <footer className="bg-card border-t border-border py-12 relative overflow-hidden">
      {/* Decorative glow */}
      <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-96 h-32 bg-primary/5 rounded-full blur-3xl" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid md:grid-cols-4 gap-8 mb-8"
        >
          {/* Brand */}
          <div className="md:col-span-2">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="flex items-center gap-2 mb-3"
            >
              <div className="w-9 h-9 rounded-lg bg-hero-gradient flex items-center justify-center animate-glow-pulse">
                <Stethoscope className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display font-bold text-lg text-foreground">Max Hospital Online</span>
            </motion.div>
            <p className="text-sm text-muted-foreground max-w-sm">
              {t("footer.description")}
            </p>
          </div>

          {/* Quick Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <h4 className="font-display font-semibold text-foreground mb-3">
              {t("footer.quickLinks")}
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#home" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">{t("nav.home")}</a></li>
              <li><a href="#departments" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">{t("nav.departments")}</a></li>
              <li><a href="#doctors" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">{t("nav.doctors")}</a></li>
              <li><a href="#news" className="hover:text-primary transition-colors hover:translate-x-1 inline-block">{t("nav.news")}</a></li>
            </ul>
          </motion.div>

          {/* Contact */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <h4 className="font-display font-semibold text-foreground mb-3">
              {t("footer.contact")}
            </h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><MapPin className="w-4 h-4" /> {t("footer.address")}</li>
              <li className="flex items-center gap-2"><Phone className="w-4 h-4" />+998 93 265 21 58</li>
              <li className="flex items-center gap-2"><Mail className="w-4 h-4" />iabduraxmondadaboyev7@gmail.com</li>
            </ul>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="border-t border-border pt-6 text-center text-xs text-muted-foreground"
        >
          © {new Date().getFullYear()} Online Hospital. {t("footer.rights")}.
        </motion.div>
      </div>
    </footer>
  );
};

export default Footer;
