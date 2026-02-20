import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useLanguage } from "@/contexts/LanguageContext";
import { motion } from "framer-motion";
import { Calendar, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

const NewsPage = () => {
  const { language, t } = useLanguage();
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    supabase
      .from("posts")
      .select("*")
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (data) setPosts(data);
      });
  }, []);

  const getTitle = (post: any) => language === "ru" ? post.title_ru : language === "en" ? post.title_en : post.title_uz;
  const getContent = (post: any) => language === "ru" ? post.content_ru : language === "en" ? post.content_en : post.content_uz;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
            <h1 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-3">{t("news.title")}</h1>
            <p className="text-muted-foreground max-w-md mx-auto">{t("news.subtitle")}</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {posts.map((post, i) => (
              <motion.article key={post.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="group cursor-pointer">
                <div className="bg-card rounded-xl overflow-hidden card-shadow hover:card-shadow-hover transition-all duration-300 hover:-translate-y-1">
                  {post.image_url ? (
                    <img src={post.image_url} alt="" className="h-48 w-full object-cover" />
                  ) : (
                    <div className="h-48 bg-secondary flex items-center justify-center text-5xl">📰</div>
                  )}
                  <div className="p-5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-2">
                      <Calendar className="w-3 h-3" />
                      {new Date(post.created_at).toLocaleDateString()}
                    </div>
                    <h3 className="font-display font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                      {getTitle(post)}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 line-clamp-3">{getContent(post)}</p>
                    <span className="inline-flex items-center gap-1 text-sm text-primary font-medium group-hover:gap-2 transition-all">
                      {t("news.readMore")} <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </motion.article>
            ))}
          </div>

          {posts.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-4xl mb-3">📰</p>
              <p>Hozircha yangiliklar yo'q</p>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default NewsPage;
