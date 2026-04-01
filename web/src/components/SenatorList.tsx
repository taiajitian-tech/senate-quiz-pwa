import { useState } from 'react';

type Person = {
  name: string;
  images?: { url: string }[];
};

type Props = {
  data: Person[];
} & Record<string, unknown>;

export default function SenatorList(props: Props) {
  const { data } = props;
  const [mode, setMode] = useState<'normal' | 'compact'>('normal');

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <button onClick={() => setMode('normal')}>通常</button>
        <button onClick={() => setMode('compact')}>小アイコン</button>
      </div>

      {mode === 'normal' ? (
        <div>
          {data.map((item, i) => (
            <div key={i} style={{ marginBottom: 10 }}>
              <img src={item.images?.[0]?.url} width={80} />
              <div>{item.name}</div>
            </div>
          ))}
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 10
          }}
        >
          {data.map((item, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <img src={item.images?.[0]?.url} width={60} />
              <div style={{ fontSize: 12 }}>{item.name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
