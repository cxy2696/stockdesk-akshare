import HudHome from './HudHome'

interface Props {
  overview: any
}

/** The HUB is the single home surface for every theme (HUD / dark / light). */
export default function Dashboard({ overview }: Props) {
  return <HudHome overview={overview} />
}
