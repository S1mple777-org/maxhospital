import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const cardVariants = {
  hidden: { opacity: 0, x: -40, rotateY: -5 },
  visible: {
    opacity: 1, x: 0, rotateY: 0,
    transition: { type: "spring", stiffness: 100, damping: 15 },
  },
};

const NewsSection = () => {
  const { language, t } = useLanguage();
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("posts")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setPosts(data);
      });
  }, []);

  const getTitle = (post: any) => language === "ru" ? post.title_ru : language === "en" ? post.title_en : post.title_uz;
  const getContent = (post: any) => language === "ru" ? post.content_ru : language === "en" ? post.content_en : post.content_uz;

  if (posts.length === 0) return null;

  return (
    <section id="news" className="py-20 relative overflow-hidden">
      <div className="absolute inset-0 bg-secondary/30" />
      <div className="absolute top-20 right-0 w-48 h-48 bg-primary/5 rounded-full blur-3xl animate-float-slow" />

      <div className="container mx-auto px-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("news.title")}</h2>
          <p className="text-muted-foreground max-w-md mx-auto">{t("news.subtitle")}</p>
        </motion.div>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px" }}
          className="grid md:grid-cols-3 gap-6"
        >
          {posts.map((post) => (
            <motion.article key={post.id} variants={cardVariants} whileHover={{ y: -8, transition: { type: "spring", stiffness: 300 } }}>
              <Link to={`/news/${post.id}`} className="group cursor-pointer block">
                <div className="bg-card rounded-xl overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 relative">
                  {/* Shimmer on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 animate-shimmer pointer-events-none z-10" />

                  {post.image_url ? (
                    <div className="h-44 overflow-hidden">
                      <img src={post.image_url} alt="" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
                    </div>
                  ) : (
                    <div className="h-44 bg-secondary flex items-center justify-center text-5xl">📰</div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.created_at).toLocaleDateString()}
                    </div>
                    <h3 className="font-display font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {getTitle(post)}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-2">{getContent(post)}</p>
                    <span className="inline-flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2.5 transition-all duration-300">
                      {t("news.readMore")} <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
                    </span>
                  </div>
                </div>
              </Link>
            </motion.article>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default NewsSection;
