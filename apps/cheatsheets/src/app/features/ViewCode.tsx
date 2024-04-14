export function ViewCode({title, sample}: {title: string, sample: string}) {
  return (
    <div className="collapse bg-base-200 rounded-none">
      <input type="checkbox" className="min-h-fit"/>
      <div className="collapse-title text-sm p-2 min-h-fit">
        {title}
      </div>
      <div className="collapse-content">
        <pre className="text-xs">
          {sample}
        </pre>
      </div>
    </div>
  )
}

export default ViewCode;
