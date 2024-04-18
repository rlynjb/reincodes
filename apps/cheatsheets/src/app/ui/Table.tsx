import { ReactNode, FC, Children } from "react";

interface IColumns {
  name: string,
  field?: string,
}

interface Props {
  children?: any,
  columns: IColumns[],
  rows?: any[],
}

/**
 * NOTE:
 * uses simple 2D array for columns and rows
 * implements Pure function/Presentational component for rendering
 * uses FunctionAsChild
 * - to access row data in parent component
 * - for manual rendering of fields
 */

export const Table: FC<Props> = ({children, columns, rows}) => {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead>
          <TableHeader columns={columns} />
        </thead>

        <tbody>
          {/* only display if children is empty */}
          {/* children can be used to render custom rows */}
          {children
            ? children(rows)
            : <TableBody columns={columns} rows={rows} />
          }
        </tbody>
      </table>
    </div>
  )
}

export const TableHeader: FC<Props> = ({columns}) => {
  return (
    <>
      <tr>
        {columns.map((column, index) => (
          <th key={index}>{column.name}</th>
        ))}
      </tr>
    </>
  )
}

export const TableBody: FC<Props> = ({columns, rows}) => {
  return (
    <>
      {rows?.map((row, rowIndex) =>
        <tr key={rowIndex}>
          {columns?.map((column, columnIndex) =>
            <td key={columnIndex}>
              {row[column.field ? column.field : '']}
            </td>
          )}
        </tr>
      )}
    </>
  )
}

export default Table;
