export default function AboutPage() {
  return (
    <div id="about-page"
        className="h-screen grid grid-cols-1 gap-4 content-center"
    >
      <div className="place-self-center text-center">
        <h1 className="text-4xl">About</h1>
        <p className="my-8">This is a cheatsheet app.</p>
        <p>
          <i>Version 1.0.0</i>
        </p>
      </div>
    </div>
  )
}
