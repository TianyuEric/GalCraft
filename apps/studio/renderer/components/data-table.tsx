import { useMemo, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { createSortedRowModel, rowSortingFeature, sortFn_alphanumeric, tableFeatures, useTable } from '@tanstack/react-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from './ui/table.js';
import './data-table.css';

const features = tableFeatures({ rowSortingFeature, sortedRowModel: createSortedRowModel(), sortFns: { alphanumeric: sortFn_alphanumeric } });

export type DataTableColumn<T> = {
  id: string;
  header: ReactNode;
  cell(row: T): ReactNode;
  className?: string;
  width?: string;
  sortValue?(row: T): string | number;
};

/** Cells own their input and selection handlers; table rows never intercept them. */
export function DataTable<T extends object>({ rows, columns, getRowId, label, empty = '—', className = '', rowClassName, toolbar, maxHeight = 420, selectedRowId }: {
  rows: readonly T[];
  columns: DataTableColumn<T>[];
  getRowId(row: T): string;
  label: string;
  empty?: ReactNode;
  className?: string;
  rowClassName?(row: T): string;
  toolbar?: ReactNode;
  maxHeight?: number | string;
  selectedRowId?: string;
}) {
  const definitions = useMemo(() => columns.map(column => ({ id: column.id, accessorFn: column.sortValue ?? (() => ''), enableSorting: !!column.sortValue, sortFn: 'alphanumeric' as const })), [columns]);
  const table = useTable({ features, data: rows, columns: definitions, getRowId, enableMultiSort: false });
  return <div className={`gc-data-table ${className}`}>
    {toolbar && <div className="gc-table-toolbar">{toolbar}</div>}
    <div className="gc-table-scroll" style={{ maxHeight }} role="region" aria-label={label} tabIndex={0}>
      <Table aria-label={label}>
        <colgroup>{columns.map(column => <col key={column.id} style={{ width: column.width }}/>)}</colgroup>
        <TableHeader><TableRow>{columns.map(column => {
          const state = table.getColumn(column.id)!;
          const sorted = state.getIsSorted();
          return <TableHead key={column.id} className={column.className} aria-sort={column.sortValue ? sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none' : undefined}>
            {column.sortValue ? <button type="button" className="gc-table-sort" onClick={state.getToggleSortingHandler()}>{column.header}{sorted === 'asc' ? <ArrowUp size={14}/> : sorted === 'desc' ? <ArrowDown size={14}/> : <ArrowUpDown size={14}/>}</button> : column.header}
          </TableHead>;
        })}</TableRow></TableHeader>
        <TableBody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row => <TableRow key={row.id} className={rowClassName?.(row.original)} data-state={row.id === selectedRowId ? 'selected' : undefined}>
          {columns.map(column => <TableCell key={column.id} className={column.className}>{column.cell(row.original)}</TableCell>)}
        </TableRow>) : <TableRow><TableCell colSpan={columns.length} className="gc-table-empty">{empty}</TableCell></TableRow>}</TableBody>
      </Table>
    </div>
  </div>;
}
