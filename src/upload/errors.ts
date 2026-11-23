/** 사용자에게 그대로 보여줘도 되는 글자 읽기 오류. 그 밖의 오류는 화면에 일반 안내만 보여줍니다. */
export class OcrError extends Error {
  name = 'OcrError'
  /**
   * 다시 읽으면 나아질 수 있는지.
   * 파일 자체의 문제(손상·형식·비밀번호·페이지 수)는 다시 읽어도 같으므로 false입니다.
   * 모델 내려받기 실패처럼 일시적인 문제는 true입니다.
   */
  retry: boolean

  constructor(message: string, { retry = true }: { retry?: boolean } = {}) {
    super(message)
    this.retry = retry
  }
}

/** 파일 자체의 문제라 다시 읽어도 소용없는 오류 */
export const fileError = (message: string) => new OcrError(message, { retry: false })
