import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Calendar, ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";

const NewsDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const { language } = useLanguage();
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);

  useEffect(() => {
    if (!id) return;
    supabase.from("posts").select("*").eq("id", id).maybeSingle().then(({ data }) => {
      if (data) setPost(data);
    });
  }, [id]);

  const getTitle = (p: any) => language === "ru" ? p.title_ru : language === "en" ? p.title_en : p.title_uz;
  const getContent = (p: any) => language === "ru" ? p.content_ru : language === "en" ? p.content_en : p.content_uz;

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="pt-24 pb-20 text-center text-muted-foreground">Yuklanmoqda...</div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-24 pb-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
            <ArrowLeft className="w-4 h-4" /> Orqaga
          </button>
          <motion.article initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {post.image_url && (
              <img src={post.image_url} alt="" className="w-full h-64 md:h-80 object-cover rounded-xl mb-6" />
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
              <Calendar className="w-4 h-4" />
              {new Date(post.created_at).toLocaleDateString()}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-6">{getTitle(post)}</h1>
            <div className="prose prose-sm max-w-none text-foreground leading-relaxed whitespace-pre-wrap">
              {getContent(post)}
            </div>
          </motion.article>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default NewsDetailPage;
