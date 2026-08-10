interface Props {
  label: string;
  staffTopY: number;
}

export function PartLabel({ label, staffTopY }: Props) {
  return (
    <text
      x={0}
      y={staffTopY + 8}
      fontSize={16}
      fontWeight={700}
      className="fill-slate-800"
    >
      {label}
    </text>
  );
}
