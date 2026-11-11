import { useEffect, useRef } from 'react'
import type { Connection, ConnectionRoute, ConnectionSide } from '../types'

const SIDES: [ConnectionSide, string][] = [['auto','自动'],['left','左边'],['right','右边'],['top','上边'],['bottom','下边']]

export default function ConnectionToolbar({ connection, onChange, onClose }: {
  connection: Connection
  onChange: (patch: ConnectionRoute) => void
  onClose: () => void
}) {
  const first = useRef<HTMLSelectElement>(null)
  useEffect(() => { first.current?.focus() }, [connection.id])
  return <div className="connection-toolbar" role="region" aria-label="连线走线设置"
    onMouseDown={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}
    onKeyDown={e => { e.stopPropagation(); if (e.key === 'Escape') onClose() }}>
    <label>走线<select ref={first} value={connection.routing ?? 'curve'} onChange={e => onChange({ routing: e.target.value as ConnectionRoute['routing'], controlPoints: undefined })}>
      <option value="elbow">折线</option><option value="curve">曲线</option><option value="straight">直线</option>
    </select></label>
    {(['fromSide','toSide'] as const).map((key, index) => <label key={key}>{index ? '终点' : '起点'}
      <select value={connection[key] ?? 'auto'} onChange={e => onChange({ [key]: e.target.value as ConnectionSide })}>
        {SIDES.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>)}
    {connection.routing === 'elbow' && <div className="connection-lane-controls" aria-label="调整折线通道">
      <span>通道</span>
      <button title="通道向左或向上移动 12" aria-label="通道向左或向上移动" onClick={() => onChange({controlPoints:undefined,laneOffset:(connection.laneOffset ?? 0)-12})}>−</button>
      <button title="通道向右或向下移动 12" aria-label="通道向右或向下移动" onClick={() => onChange({controlPoints:undefined,laneOffset:(connection.laneOffset ?? 0)+12})}>＋</button>
      <button onClick={() => onChange({controlPoints:undefined,laneOffset:0})}>自动通道</button>
    </div>}
    <button onClick={onClose} aria-label="关闭连线设置">完成</button>
  </div>
}
