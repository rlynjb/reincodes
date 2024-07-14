// Importing helper modules
import { useRef, useState, useEffect } from "react";

// Importing core components
import QuillEditor from "react-quill";

// Importing styles
import "react-quill/dist/quill.snow.css";
import styles from "./styles.module.css";


interface EditorProps {
  defaultValue?: string;
}

export const Editor = ({ defaultValue }: EditorProps) => {
  // Editor state
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    console.log('note--- ')
    console.log(value)
  }, [defaultValue])

  // Editor ref
  const quill = useRef() as any;

  const modules = {
    toolbar: {
      container: [
        [{ header: [1, 2, 3, 4, 5, 6, false] }],
        ["bold", "italic", "underline", "blockquote", "code-block"],
        [
          { list: "ordered" },
          { list: "bullet" },
        ],
      ],
    },
    clipboard: {
      matchVisual: true,
    },
  }

  const formats = [
    "header",
    "bold",
    "italic",
    "underline",
    "strike",
    "blockquote",
    "list",
    "bullet",
    "code-block",
    "clean",
  ];

  return (
    <QuillEditor
      ref={(el) => (quill.current = el)}
      className={styles["editor"]}
      theme="snow"
      value={value}
      formats={formats}
      modules={modules}
      placeholder={"What did you grasp from it?"}
      onChange={(value) => setValue(value)}
    />
  );
};

export default Editor;
