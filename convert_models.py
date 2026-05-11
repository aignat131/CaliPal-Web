"""
Convert TFLite models to TF.js GraphModel format.
Architecture: BN → Conv1D(64,k=5,relu) → BN → MaxPool(2)
              → Conv1D(128,k=4,relu) → BN → MaxPool(2)
              → LSTM(128) → Dense(32,relu) → Dense(5)
"""
import sys, types, os, struct
import tensorflow as tf
import numpy as np

sys.modules['tensorflow_decision_forests'] = types.ModuleType('tensorflow_decision_forests')
import tensorflowjs as tfjs


# ── FlatBuffer buffer reader ──────────────────────────────────────────────────

def _fb_read_u32(data, pos): return struct.unpack_from('<I', data, pos)[0]
def _fb_read_i32(data, pos): return struct.unpack_from('<i', data, pos)[0]
def _fb_read_u16(data, pos): return struct.unpack_from('<H', data, pos)[0]

def _table_field(data, table_off, field_id):
    """Return absolute position of a field in a FlatBuffer table, or None."""
    soffset  = _fb_read_i32(data, table_off)
    vt_off   = table_off - soffset
    vt_size  = _fb_read_u16(data, vt_off)
    slot     = 4 + field_id * 2
    if slot + 2 > vt_size:
        return None
    off = _fb_read_u16(data, vt_off + slot)
    return (table_off + off) if off != 0 else None

def read_tflite_buffer(model_path, buffer_idx):
    """Read buffer[buffer_idx].data from a TFLite FlatBuffer file as float32."""
    with open(model_path, 'rb') as f:
        data = f.read()

    root_off     = _fb_read_u32(data, 0)                  # Model table
    buffers_pos  = _table_field(data, root_off, 4)         # Model.buffers field=4
    if buffers_pos is None:
        raise ValueError("Model.buffers not found")

    vec_off  = buffers_pos + _fb_read_u32(data, buffers_pos)  # vector start
    vec_len  = _fb_read_u32(data, vec_off)
    if buffer_idx >= vec_len:
        raise ValueError(f"buffer {buffer_idx} out of range ({vec_len})")

    elem_pos    = vec_off + 4 + buffer_idx * 4
    buf_tbl_off = elem_pos + _fb_read_u32(data, elem_pos)      # Buffer table
    data_pos    = _table_field(data, buf_tbl_off, 0)           # Buffer.data field=0
    if data_pos is None:
        return None                                             # empty buffer

    arr_off  = data_pos + _fb_read_u32(data, data_pos)
    arr_len  = _fb_read_u32(data, arr_off)
    raw      = data[arr_off + 4: arr_off + 4 + arr_len]
    return np.frombuffer(raw, dtype=np.float32).copy()


# ── Main conversion ───────────────────────────────────────────────────────────

# Buffer indices from tf.lite.experimental.Analyzer output
LSTM_BUFFERS = {
    # buffer 91=T#3_8 used with x_t (input kernel), 92=T#3_9 used with h_prev (recurrent)
    'public/models/pushup_model.tflite': {'input_k': 91, 'recurrent_k': 92, 'bias': 93},
    'public/models/pullup_model.tflite': {'input_k': 92, 'recurrent_k': 93, 'bias': 94},
}


def convert_model(tflite_path, output_dir, input_features):
    print(f"\n{'='*60}")
    print(f"Converting: {tflite_path}")

    interp = tf.lite.Interpreter(model_path=tflite_path)
    interp.allocate_tensors()
    g = interp.get_tensor          # shorthand

    # ── Subgraph#0 weights ────────────────────────────────────────────────────
    bn1_scale  = g(29); bn1_offset = g(30)   # input BN  [f]
    conv1_k    = g(13); conv1_b    = g(2)    # Conv1 kernel OHWI, bias
    bn2_scale  = g(27); bn2_offset = g(28)   # BN after Conv1  [64]
    conv2_k    = g(12); conv2_b    = g(1)    # Conv2 kernel OHWI, bias
    bn3_scale  = g(31); bn3_offset = g(32)   # BN after Conv2  [128]
    dense1_w   = g(3);  dense1_b   = g(4)    # Dense(32) [32,128], [32]
    dense2_w   = g(14); dense2_b   = g(26)   # Dense(5)  [5,32],  [5]

    # TFLite Conv OHWI [O,1,K,I] → Keras [K,I,O]
    conv1_keras = np.transpose(conv1_k[:, 0, :, :], (1, 2, 0))
    conv2_keras = np.transpose(conv2_k[:, 0, :, :], (1, 2, 0))

    # ── LSTM weights from FlatBuffer ─────────────────────────────────────────
    bufs = LSTM_BUFFERS[tflite_path]
    lstm_rec_k_tflite = read_tflite_buffer(tflite_path, bufs['recurrent_k'])
    lstm_inp_k_tflite = read_tflite_buffer(tflite_path, bufs['input_k'])
    lstm_bias         = read_tflite_buffer(tflite_path, bufs['bias'])

    lstm_rec_k_tflite = lstm_rec_k_tflite.reshape(512, 128)
    lstm_inp_k_tflite = lstm_inp_k_tflite.reshape(512, 128)

    # TFLite FULLY_CONNECTED: output = input @ weight^T
    # So TFLite weight [512,128] → Keras [128,512]
    lstm_input_kernel     = lstm_inp_k_tflite.T    # [128,512]
    lstm_recurrent_kernel = lstm_rec_k_tflite.T    # [128,512]

    print(f"  LSTM input kernel:     {lstm_input_kernel.shape}")
    print(f"  LSTM recurrent kernel: {lstm_recurrent_kernel.shape}")
    print(f"  LSTM bias:             {lstm_bias.shape}")

    # ── Build Keras model ─────────────────────────────────────────────────────
    def fused_bn(scale, offset):
        s = tf.constant(scale, dtype=tf.float32)
        o = tf.constant(offset, dtype=tf.float32)
        return tf.keras.layers.Lambda(lambda x: x * s + o)

    inp = tf.keras.Input(shape=(90, input_features))
    x   = fused_bn(bn1_scale, bn1_offset)(inp)
    x   = tf.keras.layers.Conv1D(64,  kernel_size=5, padding='same', activation='relu', use_bias=True)(x)
    x   = fused_bn(bn2_scale, bn2_offset)(x)
    x   = tf.keras.layers.MaxPooling1D(2)(x)
    x   = tf.keras.layers.Conv1D(128, kernel_size=4, padding='same', activation='relu', use_bias=True)(x)
    x   = fused_bn(bn3_scale, bn3_offset)(x)
    x   = tf.keras.layers.MaxPooling1D(2)(x)
    x   = tf.keras.layers.LSTM(128)(x)
    x   = tf.keras.layers.Dense(32, activation='relu')(x)
    out = tf.keras.layers.Dense(5)(x)

    model = tf.keras.Model(inp, out)

    # Map layer positions: Input(0) BN(1) Conv1(2) BN(3) MaxPool(4)
    #                      Conv2(5) BN(6) MaxPool(7) LSTM(8) Dense32(9) Dense5(10)
    model.layers[2].set_weights([conv1_keras, conv1_b])
    model.layers[5].set_weights([conv2_keras, conv2_b])
    model.layers[8].set_weights([lstm_input_kernel, lstm_recurrent_kernel, lstm_bias])
    model.layers[9].set_weights([dense1_w.T, dense1_b])   # TFLite FC is [out,in] → Keras [in,out]
    model.layers[10].set_weights([dense2_w.T, dense2_b])

    # ── Verify against TFLite ──────────────────────────────────────────────────
    test = np.random.rand(1, 90, input_features).astype(np.float32)
    interp.set_tensor(0, test)
    interp.invoke()
    tflite_out = interp.get_tensor(67).flatten()
    keras_out  = model(test, training=False).numpy().flatten()

    max_diff = float(np.max(np.abs(tflite_out - keras_out)))
    print(f"  TFLite: {tflite_out}")
    print(f"  Keras:  {keras_out}")
    print(f"  Max diff: {max_diff:.6f}")
    if max_diff > 0.05:
        print("  WARNING: outputs differ — check weight mapping")
    else:
        print("  Match OK")

    # ── Save & convert ────────────────────────────────────────────────────────
    saved = output_dir + '_tmp_saved'
    tf.saved_model.save(model, saved)
    os.makedirs(output_dir, exist_ok=True)
    tfjs.converters.convert_tf_saved_model(saved, output_dir)
    print(f"  TF.js model saved: {output_dir}")
    return True


convert_model('public/models/pushup_model.tflite', 'public/models/pushup_tfjs', 4)
convert_model('public/models/pullup_model.tflite', 'public/models/pullup_tfjs', 8)
print("\nAll done.")
