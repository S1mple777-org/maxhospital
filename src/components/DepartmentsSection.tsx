import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import {
  Bone, Heart, Brain, Baby, Fingerprint, Eye, SmilePlus, Stethoscope,
} from "lucide-react";

const departments = [
  { key: "traumatology", icon: Bone, color: "from-red-400 to-orange-400" },
  { key: "cardiology", icon: Heart, color: "from-pink-400 to-rose-400" },
  { key: "neurology", icon: Brain, color: "from-purple-400 to-violet-400" },
  { key: "pediatrics", icon: Baby, color: "from-blue-400 to-cyan-400" },
  { key: "dermatology", icon: Fingerprint, color: "from-amber-400 to-yellow-400" },
  { key: "ophthalmology", icon: Eye, color: "from-teal-400 to-emerald-400" },
  { key: "dentistry", icon: SmilePlus, color: "from-green-400 to-lime-400" },
  { key: "therapy", icon: Stethoscope, color: "from-indigo-400 to-blue-400" },
];

const DepartmentsSection = () => {
  const { t } = useLanguage();

  return (
    <section id="departments" className="py-20 relative">
      <div className="absolute inset-0 bg-secondary/30" />
      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">
            {t("departments.title")}
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            {t("departments.subtitle")}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {departments.map((dept, i) => (
            <motion.div
              key={dept.key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="group cursor-pointer"
            >
              <div className="bg-card rounded-xl p-6 card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1 text-center">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${dept.color} flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                  <dept.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="font-display font-semibold text-sm text-foreground">
                  {t(`departments.${dept.key}`)}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DepartmentsSection;
