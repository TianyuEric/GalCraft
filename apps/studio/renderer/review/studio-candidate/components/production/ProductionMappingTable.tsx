import type { ReactNode } from 'react';

export type ProductionMappingColumn<Row> = {
  id: string;
  header: ReactNode;
  cell(row: Row): ReactNode;
  width?: string;
};

export function ProductionMappingTable<Row>({ rows, columns, getRowId, label, maxHeight, toolbar, empty = '—', rowClassName }: {
  rows: readonly Row[];
  columns: ProductionMappingColumn<Row>[];
  getRowId(row: Row): string;
  label: string;
  maxHeight: number;
  toolbar?: ReactNode;
  empty?: ReactNode;
  rowClassName?(row: Row): string;
}) {
  return <div className="candidate-production-mapping">
    {toolbar}
    <div className="candidate-production-table-scroll" style={{ maxHeight }} role="region" aria-label={label} tabIndex={0}>
      <table aria-label={label}>
        <colgroup>{columns.map(column => <col key={column.id} style={{ width: column.width }}/>)}</colgroup>
        <thead><tr>{columns.map(column => <th key={column.id} scope="col">{column.header}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={getRowId(row)} className={rowClassName?.(row)}>
            {columns.map(column => <td key={column.id}>{column.cell(row)}</td>)}
          </tr>)}
          {!rows.length && <tr><td colSpan={columns.length}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  </div>;
}
