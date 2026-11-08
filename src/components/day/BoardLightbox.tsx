import { Lightbox, type LightboxItem } from "@/components/common/Lightbox";
import type { BoardItem } from "@/types";

interface BoardLightboxProps {
  boards: BoardItem[];
  selectedIndex: number | null;
  onClose: () => void;
  dayNumber: number;
}

export function BoardLightbox({
  boards,
  selectedIndex,
  onClose,
  dayNumber,
}: BoardLightboxProps) {
  const items: LightboxItem[] = boards.map((b, idx) => ({
    id: b.id,
    image: b.image,
    thumb: b.thumb,
    caption: b.caption,
    downloadName: `day-${String(dayNumber).padStart(2, "0")}-board-${idx + 1}.${b.image.format}`,
  }));

  return (
    <Lightbox
      items={items}
      selectedIndex={selectedIndex}
      onClose={onClose}
      title={`Classroom Board Work — Day ${dayNumber}`}
    />
  );
}
