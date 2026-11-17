// 아이폰 사진(HEIC·HEIF)을 브라우저에서 JPG로 바꿉니다.
// 크롬 등 대부분의 브라우저는 HEIC를 직접 열지 못합니다.
// 확장자만 .jpg·.png로 바뀐 HEIC도 있어서, 확장자가 아니라 파일 앞부분(ftyp 상자)으로 알아냅니다.
// 변환 라이브러리(heic-to, 약 3MB)는 HEIC를 올렸을 때만 불러옵니다.

const HEIC_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1', 'mif2']
/** 같은 형식(HEIF 계열)을 쓰지만 브라우저가 직접 여는 AVIF는 제외합니다. */
const AVIF_BRANDS = ['avif', 'avis']

export const HEIC_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** 확장자나 브라우저가 알려준 형식으로 HEIC인지 (파일을 고를 때 빠르게 거르기용) */
export function isHeicName(file: File) {
  return HEIC_TYPES.includes(file.type) || /\.hei[cf]$/i.test(file.name)
}

/** 파일 앞부분을 읽어 실제로 HEIC인지 확인합니다. */
export async function looksLikeHeic(file: File) {
  const head = new Uint8Array(await file.slice(0, 64).arrayBuffer())
  const str = (from: number) => String.fromCharCode(...head.slice(from, from + 4))
  if (head.length < 16 || str(4) !== 'ftyp') return false
  const boxSize = Math.min(head.length, (head[0] << 24) | (head[1] << 16) | (head[2] << 8) | head[3])
  const brands = [str(8)]
  for (let at = 16; at + 4 <= boxSize; at += 4) brands.push(str(at))
  if (brands.some((b) => AVIF_BRANDS.includes(b))) return false
  return brands.some((b) => HEIC_BRANDS.includes(b))
}

/** HEIC를 JPG 파일로 바꿉니다. 이름은 확장자만 .jpg로 바꿉니다. */
export async function heicToJpeg(file: File): Promise<File> {
  const { heicTo } = await import('heic-to')
  const blob = await heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })
  const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
  return new File([blob], name, { type: 'image/jpeg' })
}
