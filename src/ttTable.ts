import * as vscode from 'vscode';
import { len, lenB } from './utils';

export enum RowType {
    Unknown,
    Separator,
    Data
}

export enum Alignment {
    Left,
    Center,
    Right
}

export interface RowDef {
    type: RowType;
}

export interface ColDef {
    alignment: Alignment;
    width: number;
}

export class Table {
    /**
     * Line where the table starts
     */
    startLine = 0;

    rows: RowDef[] = [];
    cols: ColDef[] = [];

    private data: string[][] = [];

    addRow(type: RowType, values: string[]) {
        let adjustCount = values.length - this.cols.length;
        while (adjustCount-- > 0) {
            this.cols.push({ alignment: Alignment.Left, width: 0 });
        }

        for (const row of this.data) {
            const adjustee = row.length < values.length ? row : values;
            adjustCount = Math.abs(row.length - values.length);

            while (adjustCount-- > 0) {
                adjustee.push('');
            }
        }

        this.cols.forEach((col, i) => col.width = Math.max(col.width, lenB(values[i])));

        this.rows.push({ type });
        this.data.push(values);
    }

    getAt(row: number, col: number): string {
        return this.data[row][col];
    }

    getRow(row: number): string[] {
        return this.data[row];
    }

    setAt(row: number, col: number, value: string) {
        if (this.cols[col].width < value.length) {
            this.cols[col].width = value.length;
        }

        this.data[row][col] = value;
    }
}

export interface Parser {
    parse(text: string): Table | undefined;
    isSeparatorRow(text: string): boolean;
}

export interface Stringifier {
    stringify(table: Table): string;
}

export interface Locator {
    locate(reader: LineReader, lineNr: number): vscode.Range | undefined;
}

export interface LineReader {
    lineAt(line: number): vscode.TextLine;
    lineCount: number;
}

class JumpPosition {
    constructor(start: vscode.Position, end: vscode.Position, public isSeparator: boolean, prev?: JumpPosition) {
        this.range = new vscode.Range(start, end);

        if (prev) {
            prev.next = this;
            this.prev = prev;
        }
    }

    range: vscode.Range;
    next?: JumpPosition;
    prev?: JumpPosition;
}

export class TableNavigator {
    private jumpPositions: JumpPosition[] = [];

    constructor(public table: Table) {
        this.jumpPositions = this.buildJumpPositions();
    }

    nextCell(cursorPosition: vscode.Position): vscode.Position | undefined {
        return this.jump(cursorPosition, x => x.next!);
    }

    previousCell(cursorPosition: vscode.Position): vscode.Position | undefined {
        return this.jump(cursorPosition, x => x.prev!);
    }

    nextRow(cursorPosition: vscode.Position): vscode.Position | undefined {
        const nextRowJump = this.jumpPositions.find(x => x.range.contains(cursorPosition.translate(1)));
        if (!nextRowJump) {
            return undefined;
        }

        return nextRowJump.range.start.translate(0, 1);
    }

    private jump(currentPosition: vscode.Position, accessor: (x: JumpPosition) => JumpPosition): vscode.Position | undefined {
        let jmp = this.jumpPositions.find(x => x.range.contains(currentPosition));
        if (jmp) {
            jmp = accessor(jmp);
            if (jmp) {
                if (jmp.isSeparator) {
                    if (!accessor(jmp)) {
                        return undefined;
                    }
                    jmp = accessor(jmp);
                }
                return jmp.range.start.translate(0, 1);
            }
        }

        // Maybe we're just outside left part of table? Let's move cursor a bit...
        if (currentPosition.character === 0) {
            return currentPosition.translate(0, 2);
        } else {
            return undefined;
        }
    }

    private buildJumpPositions(): JumpPosition[] {
        const result: JumpPosition[] = [];

        const cellPadding = 2;

        for (let i = 0; i < this.table.rows.length; ++i) {
            const row = this.table.rows[i];
            const rowLine = this.table.startLine + i;

            if (row.type === RowType.Separator) {
                const prevJmpPos = result[result.length - 1];
                // Extend last range to whole separator line or start from beginning of line
                const start = prevJmpPos
                    ? prevJmpPos.range.end
                    : new vscode.Position(rowLine, 0);
                const end = start.translate(1);
                const jmpPos = new JumpPosition(start, end, true, prevJmpPos);
                result.push(jmpPos);
            } else {
                let lastAnchor = 0;
                const anchors = this.table.cols.reduce((accum, col, j) => {
                    const text = this.table.getAt(i, j);
                    lastAnchor += col.width + len(text) - lenB(text) + cellPadding + 1;
                    accum.push(lastAnchor);
                    return accum;
                }, [lastAnchor]);
                // extend last point to "infinity"
                anchors[anchors.length - 1] = 999;

                for (let j = 0; j < anchors.length - 1; ++j) {
                    const prevJmpPos = result[result.length - 1];
                    const start = new vscode.Position(rowLine, anchors[j] + 1);
                    const end = new vscode.Position(rowLine, anchors[j + 1]);
                    const jmpPos = new JumpPosition(start, end, false, prevJmpPos);
                    result.push(jmpPos);
                }
            }
        }
        return result;
    }
}
