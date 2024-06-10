import { useRouteError, isRouteErrorResponse } from "react-router-dom";

export default function ErrorPage () {
  const error = useRouteError();
  let errorMsg = '' as string;

  if (isRouteErrorResponse(error)) {
    errorMsg = error.statusText || error.data.message;
  } else {
    errorMsg = 'An unexpected error has occurred.';
  }

  return (
    <div id="error-page"
      className="h-screen grid grid-cols-1 gap-4 content-center"
    >
      <div className="place-self-center text-center">
        <h1 className="text-4xl">Oops!</h1>
        <p className="my-8">Sorry, an unexpected error has occurred.</p>
        <p>
          <i>{errorMsg}</i>
        </p>
      </div>
    </div>
  )
}
