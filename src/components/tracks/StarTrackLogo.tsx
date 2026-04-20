interface StarTrackLogoProps {
  variant?: 'hero' | 'nav' | 'stamp'
  subtle?: boolean
  animated?: boolean
  showWordmark?: boolean
  showNewBadge?: boolean
  title?: string
  subtitle?: string
  className?: string
}

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ')
}

export default function StarTrackLogo({
  variant = 'hero',
  subtle = false,
  animated = true,
  showWordmark = false,
  showNewBadge = false,
  title = '星轨',
  subtitle = '把长期目标拉成可以持续复利的轨迹',
  className,
}: StarTrackLogoProps) {
  return (
    <div
      className={joinClassNames(
        'startrack-logo',
        `startrack-logo-${variant}`,
        subtle && 'subtle',
        animated && 'animated',
        className,
      )}
      aria-hidden="true"
    >
      <div className="startrack-logo-art">
        <svg viewBox="0 0 160 120" role="presentation">
          <path className="startrack-trail outer" d="M14 82C40 42 91 20 147 31" />
          <path className="startrack-trail mid" d="M24 97C55 61 99 44 147 49" />
          <path className="startrack-trail inner" d="M37 108C70 79 105 67 145 66" />
          <circle className="startrack-orbit-dot orbit-dot-a" cx="116" cy="26" r="4.6" />
          <circle className="startrack-orbit-dot orbit-dot-b" cx="132" cy="49" r="3.6" />
          <circle className="startrack-orbit-dot orbit-dot-c" cx="123" cy="67" r="3.2" />
          <path
            className="startrack-core"
            d="M47 22l5.2 11.6 12.6 1.1-9.4 8.3 2.8 12.2L47 49.3 35.8 55.2l2.8-12.2-9.4-8.3 12.6-1.1L47 22z"
          />
          <path className="startrack-spark spark-a" d="M84 18l1.8 4.3 4.5.3-3.4 2.9 1 4.4-3.9-2.1-3.9 2.1 1-4.4-3.4-2.9 4.5-.3L84 18z" />
          <path className="startrack-spark spark-b" d="M98 88l1.4 3.3 3.5.2-2.6 2.3.8 3.5-3.1-1.7-3.1 1.7.8-3.5-2.6-2.3 3.5-.2L98 88z" />
          <path className="startrack-spark spark-c" d="M137 17l1 2.4 2.4.2-1.8 1.6.6 2.5-2.2-1.2-2.2 1.2.6-2.5-1.8-1.6 2.4-.2 1-2.4z" />
        </svg>
      </div>

      {showWordmark && (
        <div className="startrack-logo-copy">
          <div className="startrack-logo-title-row">
            <strong>{title}</strong>
            {showNewBadge && <span className="startrack-new-badge">NEW</span>}
          </div>
          <span>{subtitle}</span>
        </div>
      )}
    </div>
  )
}
