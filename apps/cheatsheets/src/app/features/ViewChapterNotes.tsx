import {
  Table,
} from "../ui"
import { ViewNote } from '.';
import {
  useI18nTranslate,
} from "../utils/i18n"


export const ViewChapterNotes = (props: any) => {
  const translate = useI18nTranslate()

  const columns = [
    { name: `${translate('howtoField')}`, field: "problem" },
    { name: `${translate('solutionLabel')}`, field: "title" }
  ]

  return (
    <>
      <Table
        columns={columns}
        rows={props.selected}
      >
        {(customRows: any) => customRows.map((item: any, index: number) =>
          <tr key={index}>
            <td className="align-text-top min-w-96">
              {item.problem ? item.problem : ''}
            </td>
            <td className="align-text-top">
              <ViewNote
                title={item.title}
                desc={item.desc}
                sample={item.sample}
              />
            </td>
          </tr>
        )}
      </Table>
    </>
  )
}

export default ViewChapterNotes;
