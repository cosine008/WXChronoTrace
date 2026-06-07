interface BaseCommentAnchor {
  schemaId: number;
  entityId: number;
  displayCode: string;
}

export interface RowCommentAnchor extends BaseCommentAnchor {
  anchorType: "row";
}

export interface CellCommentAnchor extends BaseCommentAnchor {
  anchorType: "cell";
  fieldKey: string;
  fieldLabel: string;
  recordId: number;
  contextDate: string;
  value: unknown;
}

export type CommentAnchor = RowCommentAnchor | CellCommentAnchor;
