import Hero from "@/components/Home/Hero";
import FeaturedProjects from "@/components/Home/FeaturedProjects";
import Concepts from "@/components/Home/Concepts";
import Implementations from "@/components/Home/Implementations";

export default function Home() {
  return (
    <div className="max-w-[720px] mx-auto px-4 sm:px-6 py-6 text-left">
      <Hero />
      <FeaturedProjects />
      <Concepts />
      <Implementations />
    </div>
  );
}
