import { ReactNode, FC } from "react";

interface Props {
  children?: ReactNode,
  onClick?: () => void,
}

/*
  NOTE:
  - this uses Pure Function
*/

export const Button: FC<Props> = ({children, onClick}) => {
  return (
    <button
      className="btn rounded-none w-full"
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export default Button;
