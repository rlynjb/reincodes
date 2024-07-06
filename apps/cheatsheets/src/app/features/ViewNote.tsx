import parse from 'html-react-parser';
import { FC, useEffect } from 'react';
import { useQuill } from 'react-quilljs';
import 'quill/dist/quill.snow.css';


interface Props {
  title: string
  sample?: string
  desc?: string
}

/**
 * TODO:
 * 1. setup QuillJS and render desc values << WIP
 * 2. move sample values to desc property
 * 3. convert Note Title to input field
 * 4. convert How To column values to input field
 * 5. convert Side Nav Books and Chapters to input field
 * 6. add "Add Note" form
 * 7. add "Add Book" form
 * 8. add "Add Chapter" form
 * 9. Setup store and implement https://knexjs.org/
*/

export const ViewNote: FC<Props> = ({title, sample = ``, desc = ''}) => {
  const toolbarOptions = [
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ 'header': 1 }, { 'header': 2 }, { 'header': 3 }, { 'header': 4 }, { 'header': 5 }, { 'header': 6 }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
  ]

  const formats = [
    'bold', 'italic', 'underline', 'strike',
    'align', 'list', 'indent',
    'size', 'header',
    'link', 'image', 'video',
    'color', 'background',
    'clean',
  ]


  const { quill, quillRef } = useQuill({
    modules: {
      toolbar: toolbarOptions
    },
    formats
  });

  useEffect(() => {
    if (quill) {
      quill.clipboard.dangerouslyPasteHTML(desc);
    }
  }, [quill]);

  return (
    <div className="collapse bg-base-200 rounded-none">
      <input type="checkbox" className="min-h-fit"/>
      <div className="collapse-title text-sm p-2 min-h-fit">
        {title}
      </div>
      <div className="collapse-content">

        <div>
          <div ref={quillRef} />
        </div>

        {/**
        <div
          className="text-xs"
        >
          {parse(desc)}
        </div>
        <pre className="text-xs">
          {sample}
        </pre>
         */}
      </div>
    </div>
  )
}

export default ViewNote;
