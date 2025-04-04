import { Llama3 } from '@jsgrad/jsgrad'

const onProgress = (p) => {
  document.querySelector('#out').textContent = `${p.label} - ${p.i}/${p.size}`
}

const model = await Llama3.load({
  size: '1B',
  quantize: 'float16',
  onProgress,
})

while (true) {
  const res = await model.chat({
    messages: [{ role: 'user', content: prompt('Q:') }],
    onProgress,
  })
  alert(res.message.content)
}
