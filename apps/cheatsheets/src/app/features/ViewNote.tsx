export function ViewNote({title, sample, desc}: {title: string, sample: string, desc: string}) {
  return (
    <div className="collapse bg-base-200 rounded-none">
      <input type="checkbox" className="min-h-fit"/>
      <div className="collapse-title text-sm p-2 min-h-fit">
        {title}
      </div>
      <div className="collapse-content">
        <p className="text-xs">
          {desc}
        </p>
        <pre className="text-xs">
          {sample}
        </pre>
      </div>
    </div>
  )
}

export default ViewNote;
