import parse from 'html-react-parser';
import { FC } from 'react';

interface Props {
  title: string
  sample?: string
  desc?: string
}

export const ViewNote: FC<Props> = ({title, sample = ``, desc = ''}) => {
  return (
    <div className="collapse bg-base-200 rounded-none">
      <input type="checkbox" className="min-h-fit"/>
      <div className="collapse-title text-sm p-2 min-h-fit">
        {title}
      </div>
      <div className="collapse-content">
        <div
          className="text-xs"
        >
          {parse(desc)}
        </div>
        <pre className="text-xs">
          {sample}
        </pre>
      </div>
    </div>
  )
}

export default ViewNote;
