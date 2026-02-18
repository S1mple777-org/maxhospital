import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Star } from "lucide-react";

const doctorsData = [
  { name: "Dr. Karimov Sherzod", dept: "cardiology", exp: 12, patients: 3200, online: true },
  { name: "Dr. Ivanova Elena", dept: "neurology", exp: 8, patients: 2100, online: true },
  { name: "Dr. Rustamov Jasur", dept: "traumatology", exp: 15, patients: 4500, online: false },
  { name: "Dr. Petrova Olga", dept: "pediatrics", exp: 10, patients: 2800, online: true },
];

const avatarColors = [
  "from-teal-400 to-emerald-500",
  "from-blue-400 to-indigo-500",
  "from-amber-400 to-orange-500",
  "from-pink-400 to-rose-500",
];

const DoctorsSection = () => {
  const { t } = useLanguage();

  return (
    <section id="doctors" className="py-20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
            {t("doctors.title")}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t("doctors.subtitle")}
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {doctorsData.map((doc, i) => (
            <motion.div
              key={doc.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
              className="group"
            >
              <div className="bg-card rounded-xl overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1">
                {/* Avatar */}
                <div className="relative h-48 bg-secondary flex items-center justify-center">
                  <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${avatarColors[i]} flex items-center justify-center text-3xl font-bold text-white shadow-lg`}>
                    {doc.name.split(" ")[1]?.[0] || "D"}
                  </div>
                  {/* Online badge */}
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${doc.online ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${doc.online ? "bg-green-500" : "bg-muted-foreground"}`} />
                    {doc.online ? t("doctors.online") : t("doctors.offline")}
                  </div>
                </div>

                <div className="p-4">
                  <h3 className="font-display font-semibold text-foreground mb-1">{doc.name}</h3>
                  <p className="text-sm text-primary font-medium mb-3">
                    {t(`departments.${doc.dept}`)}
                  </p>

                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                    <span>{doc.exp} {t("doctors.experience")}</span>
                    <span>{doc.patients.toLocaleString()}+ {t("doctors.patients")}</span>
                  </div>

                  <div className="flex items-center gap-0.5 mb-4">
                    {[1,2,3,4,5].map((s) => (
                      <Star key={s} className="w-3.5 h-3.5 fill-warning text-warning" />
                    ))}
                    <span className="text-xs text-muted-foreground ml-1">5.0</span>
                  </div>

                  <button className="w-full py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary hover:text-primary-foreground transition-colors">
                    {t("doctors.viewProfile")}
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DoctorsSection;
