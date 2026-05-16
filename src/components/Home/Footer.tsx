export default function Footer() {
  return (
    <footer className="pt-6 border-t border-neutral-800 text-[11px] flex gap-3.5 flex-wrap">
      <a href="https://github.com/rlynjb" target="_blank" rel="noopener noreferrer"
         className="text-gray-400 hover:text-white">github</a>
      <a href="https://www.linkedin.com/in/rlynpro" target="_blank" rel="noopener noreferrer"
         className="text-gray-400 hover:text-white">linkedin</a>
      <a href="mailto:rlynjb@gmail.com"
         className="text-gray-400 hover:text-white">email</a>
      <a href="https://drive.google.com/file/d/1oc76y0acIjDwt2yObF7fZ3xyEGNP4E99/view?usp=sharing" target="_blank" rel="noopener noreferrer"
         className="text-gray-400 hover:text-white">resume</a>
    </footer>
  );
}
