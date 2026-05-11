import tensorflow as tf
import numpy as np

interpreter = tf.lite.Interpreter(model_path="public/models/pushup_model.tflite")
interpreter.allocate_tensors()

details = interpreter.get_input_details()
print("Input shape:", details[0]['shape'])
print("Input dtype:", details[0]['dtype'])
print("Quantization params:", details[0]['quantization_parameters'])

test_input = np.zeros(details[0]['shape'], dtype=np.float32)
interpreter.set_tensor(details[0]['index'], test_input)
interpreter.invoke()
out = interpreter.get_output_details()
print("Output:", interpreter.get_tensor(out[0]['index']))
