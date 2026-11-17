/** 사용자에게 그대로 보여줘도 되는 글자 읽기 오류. 그 밖의 오류는 화면에 일반 안내만 보여줍니다. */
export class OcrError extends Error {
  name = 'OcrError'
}
