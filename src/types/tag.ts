export type TagItem = {
  id: string;
  name: string;
  selected: boolean;
  canClose?: boolean;
};

export type TagListProps = {
  tags: TagItem[];
  onToggleTag: (id: string) => void;
  onAddTag: (name: string) => void;
  onRemoveTag: (id: string) => void;
  showAddControls?: boolean;
  showRemoveButton?: boolean;
  maxTags?: number;
  allowDuplicate?: boolean;
  className?: string;
  tagClassName?: string;
  selectedTagClassName?: string;
  unselectedTagClassName?: string;
  inputClassName?: string;
};
