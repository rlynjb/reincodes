import { FC, useState, useEffect } from 'react';
import { Editor } from '../ui/Editor';


interface Props {
  title: string
  sample?: string
  desc?: string
}

/**
 * TODO:
 * 1. setup QuillJS and render desc values << WIP
 *    Create a React wrapper for Quilljs << DONE
 * 2. move sample values to desc property
 * 3. convert Note Title to input field
 * 4. convert How To column values to input field
 * 5. convert Side Nav Books and Chapters to input field
 * 6. add "Add Note" form
 * 7. add "Add Book" form
 * 8. add "Add Chapter" form
 * 9. Setup store and implement https://knexjs.org/
*/

export const ViewNote: FC<Props> = ({title, sample = ``, desc = ''}: Props) => {
  const [range, setRange] = useState();
  const [lastChange, setLastChange] = useState();
  const [readOnly, setReadOnly] = useState(false);

/*
  useEffect(() => {
    console.log(desc)
  }, [desc]);
*/

  return (
    <div className="collapse bg-base-200 rounded-none">
      <input type="checkbox" className="min-h-fit"/>
      <div className="collapse-title text-sm p-2 min-h-fit">
        {title}
      </div>
      <div className="collapse-content">
        {desc}
        <Editor
          defaultValue={desc}
        />
      </div>
    </div>
  )
}

export default ViewNote;
