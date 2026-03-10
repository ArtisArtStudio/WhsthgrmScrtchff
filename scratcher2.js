/**
 * Scratch-off canvas
 *
 * NOTE: this code monkeypatches Function.prototype.bind() if it doesn't
 * already exist.
 *
 * NOTE: This is demo code that has been converted to be less demo-y.
 * But it is still demo-y.
 *
 * To make (more) correct:
 *  o   add error handling on image loads
 *  o   fix inefficiencies
 *
 * depends on jQuery>=1.7
 *
 * Portions Copyright (c) 2012 Brian "Beej Jorgensen" Hall <beej@beej.us>
 *
 * Permission is hereby granted, free of charge, to any person obtaining
 * a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish,
 * distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so, subject to
 * the following conditions:
 *
 * The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
 * TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

Scratcher = (function() {

    /**
     * Helper function to extract the coordinates from an event, whether the
     * event is a mouse or touch.
     */

    function getEventCoords(ev) {
        let first, coords = {};
        let origEv = ev.originalEvent; // get from jQuery
    
        if (origEv.changedTouches != undefined) {
            first = origEv.changedTouches[0];
            coords.pageX = first.pageX;
            coords.pageY = first.pageY;
        } else {
            coords.pageX = ev.pageX;
            coords.pageY = ev.pageY;
        }
    
        return coords;
    };
    
    /**
     * Helper function to get the local coords of an event in an element.
     *
     * @param elem element in question
     * @param ev the event
     */
    function getLocalCoords(elem, coords) {
        let offset = $(elem).offset();
        return {
            'x': coords.pageX - offset.left,
            'y': coords.pageY - offset.top
        };
    };

    /**
     * Construct a new scratcher object
     *
     * @param canvasId [string] the canvas DOM ID, e.g. 'canvas2'
     * @param cmessage [string] canvas message text
     * @param backImage [string, optional] URL to background (bottom) image
     * @param frontImage [string, optional] URL to foreground (top) image
     * @param shape [string] scratcher shape
     * @param containslongw {boolean}
     * @param pixels
     * @param triggered {boolean}
     */
    function Scratcher(canvasId, backImage, frontImage, cmessage) {
        this.canvas = {
            'main': $('#' + canvasId).get(0),
            'temp':null,
            'draw':null,
        };
        this.mouseDown = false;

        this.canvasId = canvasId;
    
        this._setupCanvases(); // finish setup from constructor now
    
        this.setImages(backImage, frontImage);
        this.containslongw=false;

    
        this._eventListeners = {};
    };
    
    /**
     * Set the images to use
     */
    Scratcher.prototype.setImages = function(backImage, frontImage) {
        this.image = {
            'back': { 'url':backImage, 'img':null },
            'front': { 'url':frontImage, 'img':null }
        };
    
        if (backImage && frontImage) {
            this._loadImages(); // start image loading from constructor now
        }
    };
    Scratcher.prototype.setText = function(cmessage) {
        this.cmessage = cmessage;
    };
    Scratcher.prototype.getLW = function() {
        return containslongw;
    };
    Scratcher.prototype.setShape = function(shape) {
        this.shape = shape;
    };
    /**
     * Returns how scratched the scratcher is
     *
     * By adjusting the stride, you get a less accurate result, but it is
     * quicker to compute (pixels are skipped)
     *
     * @param stride [optional] pixel step value, default 1
     *
     * @return the fraction the canvas has been scratched (0.0 -> 1.0)
     */
    Scratcher.prototype.fullAmount = function(stride) {
        let i, l;
        let can = this.canvas.draw;
        let ctx = can.getContext("2d", { willReadFrequently: true });
        let count, total;
        let pdata;
    
        if (!stride || stride < 1) { stride = 1; }
    
        stride *= 4; // 4 elements per pixel
        
        this.pixels = ctx.getImageData(0, 0, can.width, can.height);
        pdata = this.pixels.data;
        l = pdata.length; // 4 entries per pixel
    
        total = (l / stride)|0;
    
        for (i = count = 0; i < l; i += stride) {
            if (pdata[i] != 0) {
                count++;
            }
        }
        /* let n = count/total;
        n= (n*100)| 0;
         if (n>30){
            //ctx.clearRect(0, 0, can.width, can.height);
             ctx.fillStyle = '#0'
             ctx.beginPath();
             ctx.fillRect(0,0,can.width,can.height); */
             //let mainctx = this.canvas.main.getContext('2d');
         
            
             //let drawctx = this.canvas.draw.getContext('2d');
            //mainctx.globalCompositeOperation = 'source-in';
            //mainctx.drawImage(this.image.back.img, 0, 0,this.image.back.img.width, this.image.back.img.height,0,0,this.canvas.temp.width,this.canvas.temp.height);
            //drawctx.globalCompositeOperation = 'source-over';
            //drawctx.drawImage(this.image.back.img, 0, 0,this.image.back.img.width, this.image.back.img.height,0,0,this.canvas.temp.width,this.canvas.temp.height);
            
        //} 
        return count/total;
    };
     /**
     * Draw a scratch line
     * 
     * Dispatches the 'scratch' event.
     *
     * @param x,y the coordinates
     * @param fresh start a new line if true
     */
     Scratcher.prototype.scratchLine = function(x, y, fresh) {
        let can = this.canvas.draw;
        let ctx = can.getContext('2d', { willReadFrequently: true });
        
        //can.getContext("2d", { willReadFrequently: true });
        ctx.lineWidth = 30;
        ctx.lineCap = ctx.lineJoin = 'round';
        ctx.strokeStyle = '#f00'; //'rgba(0, 0, 0, 0.03)'; // can be any opaque color
        
        if (fresh) {
            ctx.beginPath();
            // this +0.01 hackishly causes Linux Chrome to draw a
            // "zero"-length line (a single point), otherwise it doesn't
            // draw when the mouse is clicked but not moved:
            ctx.moveTo(x+0.01, y);
        }
        ctx.lineTo(x, y);
        ctx.stroke();
    
        // call back if we have it
        this.dispatchEvent(this.createEvent('scratch'));
    };
    
    /**
     * Recomposites the canvases onto the screen
     *
     * Note that my preferred method (putting the background down, then the
     * masked foreground) doesn't seem to work in FF with "source-out"
     * compositing mode (it just leaves the destination canvas blank.)  I
     * like this method because mentally it makes sense to have the
     * foreground drawn on top of the background.
     *
     * Instead, to get the same effect, we draw the whole foreground image,
     * and then mask the background (with "source-atop", which FF seems
     * happy with) and stamp that on top.  The final result is the same, but
     * it's a little bit weird since we're stamping the background on the
     * foreground.
     *
     * OPTIMIZATION: This naively redraws the entire canvas, which involves
     * four full-size image blits.  An optimization would be to track the
     * dirty rectangle in scratchLine(), and only redraw that portion (i.e.
     * in each drawImage() call, pass the dirty rectangle as well--check out
     * the drawImage() documentation for details.)  This would scale to
     * arbitrary-sized images, whereas in its current form, it will dog out
     * if the images are large.
     */
    Scratcher.prototype.recompositeCanvases = function(clear) {
        let tempctx = this.canvas.temp.getContext('2d');
        let mainctx = this.canvas.main.getContext('2d');
        let drawctx = this.canvas.draw.getContext('2d');
        //let offCanvas = document.createElement('canvas');
        let w = this.canvas.temp.width;
        let h =this.canvas.temp.height;
        // Step 1: clear the temp
        this.canvas.temp.width = this.canvas.temp.width; // resizing clears
        this.canvas.main.width = this.canvas.main.width; // resizing clears
        //offCanvas.width = this.canvas.main.width; // resizing clears
        //offCanvas.height = this.canvas.main.height; // resizing clears
        tempctx.save();
        tempctx.beginPath();
        switch(this.shape) {
            case 'heart':
                drawHeart(tempctx,w*0.5,0,w,w);
                break;
            case 'square':
                drawRect(tempctx,0,0,w,w);
                break;
            case 'circle':
                tempctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
                break;
            default:
                tempctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
            }
        tempctx.closePath();
        tempctx.clip();
        // Step 2: stamp the draw on the temp (source-over)
        if(clear) {
            drawctx.globalCompositeOperation = 'source-over';
            drawctx.drawImage(this.image.back.img, 0, 0,this.image.back.img.width, this.image.back.img.height,0,0,w,h);
        }
        tempctx.drawImage(this.canvas.draw, 0, 0);
        tempctx.beginPath();
        switch(this.shape) {
            case 'heart':
                drawHeart(tempctx,w*0.5,0,w,w);
                break;
            case 'square':
                drawRect(tempctx,0,0,w,w);
                break;
            case 'circle':
                tempctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
                break;
            default:
                tempctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
            }
        tempctx.clip();
        tempctx.closePath();
        
        //tempctx.restore();
        // Step 3: stamp the background on the temp (!! source-atop mode !!)
        if (!clear) {
            tempctx.globalCompositeOperation = 'source-atop';
            tempctx.drawImage(this.image.back.img, 0, 0,this.image.back.img.width, this.image.back.img.height,0,0,w,h);
        } 
        mainctx.save();
        mainctx.beginPath();
        switch(this.shape) {
            case 'heart':
                drawHeart(mainctx,w*0.5,0,w,w);
                break;
            case 'square':
                drawRect(mainctx,0,0,w,w);
                break;
            case 'circle':
                mainctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
                break;
            default:
                mainctx.arc(w*0.5, w*0.5, w*0.5, 0, Math.PI * 2, true);
            }
        mainctx.closePath();
        mainctx.clip();
        // Step 4: stamp the foreground on the display canvas (source-over)
        mainctx.drawImage(this.image.front.img, 0, 0,this.image.front.img.width, this.image.front.img.height,0,0,this.canvas.temp.width,this.canvas.temp.height);
        switch(this.shape) {
            case 'heart':
                break;
            case 'circle':
                mainctx.arc(0, 0, w*0.5, 0, Math.PI * 2, true);
                break;
            default:
                mainctx.arc(0, 0, w*0.5, 0, Math.PI * 2, true);
            }
       
        //tempctx.restore();
        // Step 5: stamp the temp on the display canvas (source-over)
        mainctx.globalCompositeOperation = 'source-over';

        mainctx.drawImage(this.canvas.temp, 0, 0);

    };
    function drawRect(context,x,y,width,height) {
        context.rect(x,y,width,height);
    }
    function drawHeart(context, x, y, width, height){
        let topCurveHeight = height * 0.3;
        context.moveTo(x, y + topCurveHeight);
        // top left curve

   
        context.bezierCurveTo(x, y, 
                              x - width / 2, y, 
                              x - width / 2, y + topCurveHeight
         );
        
        // bottom left curve
        context.bezierCurveTo(x - width / 2, y + (height + topCurveHeight) / 2, 
                              x, y + (height + topCurveHeight) / 2, 
                              x, y + height
         );
        
        // bottom right curve
        context.bezierCurveTo(x, y + (height + topCurveHeight) / 2, 
                              x + width / 2, y + (height + topCurveHeight) / 2, 
                              x + width / 2, y + topCurveHeight
         );
        
        // top right curve
        context.bezierCurveTo(x + width / 2, y, 
                              x, y, 
                              x, y + topCurveHeight
         );
        
        

    }
    function printAtWordWrap( offCanvas, context , text, x, y, lineHeight, fitWidth,indent)
{
    fitWidth = fitWidth || 0;
    //context.textAlign="center";
    let offCtx = offCanvas.getContext("2d");

    offCtx.font = context.font; // Copy font settings
    offCtx.fillStyle = context.fillStyle; // Copy fill style
    offCtx.textAlign = "center";
    offCtx.textBaseline = "top"; 
    let words = text.split(" ");
    let currentLine = 0;
    let idx = 1;
    let lw = false;
    let lwcount = 0;

    for (let index = 0; index < words.length; index++) {
        if (words[index].length > 9) {
            lwcount++;
        }
    }

    while (words.length > 0 && idx <= words.length) {
        let str = words.slice(0, idx).join(" ");
        let st = words.slice(idx - 1, idx).join(" ");
        let w = offCtx.measureText(str).width;

        if (offCtx.measureText(st).width > fitWidth - (currentLine * Math.pow(indent, 1.55)) || (lwcount > 5 && currentLine > 5 && indent > 2)) {
            this.containslongw = true;
            lw = true;
        }
        if (w > fitWidth - (currentLine * Math.pow(indent, 1.55))) {
            if (idx == 1) {
                idx = 2;
            }
            offCtx.fillText(words.slice(0, idx - 1).join(" "), fitWidth / 2, lineHeight * currentLine);
            currentLine++;
            words = words.splice(idx - 1);
            idx = 1;
        } else {
            idx++;
        }
    }
    if (idx > 0) {
        offCtx.fillText(words.join(" "), fitWidth / 2, lineHeight * currentLine);
    }
    if (!lw) {
        this.containslongw = false;
    }
    //alert(lwcount+ " "+currentLine);
     // Now draw this offscreen canvas as an image onto the main canvas
     context.drawImage(offCanvas, x-fitWidth/2, y-lineHeight);
}
  
   
    /**
     * Set up the main canvas and listeners
     */
    Scratcher.prototype._setupCanvases = function() {
        let c = this.canvas.main;
    
        // create the temp and draw canvases, and set their dimensions
        // to the same as the main canvas:
        this.canvas.temp = document.createElement('canvas');
        this.canvas.draw = document.createElement('canvas');
        this.canvas.temp.width = this.canvas.draw.width = c.width;
        this.canvas.temp.height = this.canvas.draw.height = c.height;
    
        /**
         * On mouse down, draw a line starting fresh
         *
         * Dispatches the 'scratchesbegan' event.
         */
        function mousedown_handler(e) {
            if (this.triggered) {return;}
            let local = getLocalCoords(c, getEventCoords(e));
            this.mouseDown = true;
            this.scratchLine(local.x, local.y, true);
            this.recompositeCanvases(false);
            
            this.dispatchEvent(this.createEvent('scratchesbegan'));
            
            return false;
        };
    
        /**
         * On mouse move, if mouse down, draw a line
         *
         * We do this on the window to smoothly handle mousing outside
         * the canvas
         */
        function mousemove_handler(e) {
            if (this.triggered) {return;}

            if (!this.mouseDown) { return true; }
    
            let local = getLocalCoords(c, getEventCoords(e));
    
            this.scratchLine(local.x, local.y, false);
            this.recompositeCanvases(false);
    
            return false;
        };
    
        /**
         * On mouseup.  (Listens on window to catch out-of-canvas events.)
         *
         * Dispatches the 'scratchesended' event.
         */
        function mouseup_handler(e) {
            if (this.triggered) {return;}

            if (this.mouseDown) {
                this.mouseDown = false;
    
                this.dispatchEvent(this.createEvent('scratchesended'));
    
                return false;
            }
    
            return true;
        };
    
        
        $(c).on('mousedown', mousedown_handler.bind(this))
            .on('touchstart', mousedown_handler.bind(this));
        $(document).on('mousemove', mousemove_handler.bind(this));
        $(document).on('touchmove', mousemove_handler.bind(this));
    
        $(document).on('mouseup', mouseup_handler.bind(this));
        $(document).on('touchend', mouseup_handler.bind(this));
    };
    
    /**
     * Reset the scratcher
     *
     * Dispatches the 'reset' event.
     *
     */
    Scratcher.prototype.reset = function() {
        // clear the draw canvas
        this.canvas.draw.width = this.canvas.draw.width;
        this.pixels=null;
        this.triggered=false;
        this.recompositeCanvases(false);
    
        // call back if we have it
        this.dispatchEvent(this.createEvent('reset'));
    };
    Scratcher.prototype.clear = function() {
        this.triggered = true;
        this.recompositeCanvases(true);
    }
    Scratcher.prototype.resetnoclear = async function(clear) {
        let c = this.canvas.main;
        let cc = this.canvas.temp;
        const resizeWidth = c.width >> 0
        const resizeHeight = c.height >> 0
       
        let ratio=1;

        if (this.pixels && !clear){
            
           /*  const ibm = await window.createImageBitmap(this.pixels, 0, 0, this.canvas.draw.width, this.canvas.draw.width, {
                resizeWidth, resizeHeight
              })

            if (c.width>cc.width) {
                ratio = cc.width / c.width;
            } else {
                ratio = c.width / cc.width;
            }
        
            this.canvas.temp.width  = this.canvas.draw.width = c.width;
            this.canvas.temp.height = this.canvas.draw.height = c.height;

            let ctx = this.canvas.draw.getContext('2d');
         
            ctx.drawImage(ibm,0,0);
            this.pixels = ctx.getImageData(0,0,c.width,c.height); */
            let newCanvas = $("<canvas>")
            .attr("width", cc.width)
            .attr("height", cc.height)[0];

            newCanvas.getContext("2d").putImageData(this.pixels, 0, 0);

            // Second canvas, for scaling
            let scaleCanvas = $("<canvas>")
            .attr("width", c.width)
            .attr("height", c.height)[0];
            let scaleCtx = scaleCanvas.getContext("2d");
            ratio = c.width / cc.width;

            scaleCtx.scale(ratio, ratio);
            scaleCtx.drawImage(newCanvas, 0, 0);

            this.pixels =  scaleCtx.getImageData(0, 0, scaleCanvas.width, scaleCanvas.height);
            this.canvas.temp.width  = this.canvas.draw.width = c.width;
            this.canvas.temp.height = this.canvas.draw.height = c.height;

            let ctx = this.canvas.draw.getContext('2d');
            ctx.putImageData(this.pixels, 0, 0);


        } else {
            this.canvas.temp.width = this.canvas.draw.width = c.width;
            this.canvas.temp.height = this.canvas.draw.height = c.height;            
        }
        this.recompositeCanvases(clear);
    };
    /**
     * returns the main canvas jQuery object for this scratcher
     */
    Scratcher.prototype.mainCanvas = function() {
        return this.canvas.main;
    };
    
    /**
     * Handle loading of needed image resources
     *
     * Dispatches the 'imagesloaded' event
     */
    Scratcher.prototype._loadImages = function() {
        let loadCount = 0;
    
        // callback for when the images get loaded
        function imageLoaded(e) {
            loadCount++;
    
            if (loadCount >= 2) {
                // call the callback with this Scratcher as an argument:
                this.dispatchEvent(this.createEvent('imagesloaded'));
                this.reset();
            }
        }
    
        // load BG and FG images
        for (k in this.image) if (this.image.hasOwnProperty(k)) {
            this.image[k].img = document.createElement('img'); // image is global
            $(this.image[k].img).on('load', imageLoaded.bind(this));
            this.image[k].img.src = this.image[k].url;
        }
    };
    
    /**
     * Create an event
     *
     * Note: not at all a real DOM event
     */
    Scratcher.prototype.createEvent = function(type) {
        let ev = {
            'type': type,
            'target': this,
            'currentTarget': this
        };
    
        return ev;
    };
    
    /**
     * Add an event listener
     */
    Scratcher.prototype.addEventListener = function(type, handler) {
        let el = this._eventListeners;
    
        type = type.toLowerCase();
    
        if (!el.hasOwnProperty(type)) {
            el[type] = [];
        }
    
        if (el[type].indexOf(handler) == -1) {
            el[type].push(handler);
        }
    };
    
    /**
     * Remove an event listener
     */
    Scratcher.prototype.removeEventListener = function(type, handler) {
        let el = this._eventListeners;
        let i;
    
        type = type.toLowerCase();
    
        if (!el.hasOwnProperty(type)) { return; }
    
        if (handler) {
            if ((i = el[type].indexOf(handler)) != -1) {
                el[type].splice(i, 1);
            }
        } else {
            el[type] = [];
        }
    };
    
    /**
     * Dispatch an event
     */
    Scratcher.prototype.dispatchEvent = function(ev) {
        let el = this._eventListeners;
        let i, len;
        let type = ev.type.toLowerCase();
    
        if (!el.hasOwnProperty(type)) { return; }
    
        len = el[type].length;
    
        for(i = 0; i < len; i++) {
            el[type][i].call(this, ev);
        }
    };
    
    /**
     * Set up a bind if you don't have one
     *
     * Notably, Mobile Safari and the Android web browser are missing it.
     * IE8 doesn't have it, but <canvas> doesn't work there, anyway.
     *
     * From MDN:
     *
     * https://developer.mozilla.org/en/JavaScript/Reference/Global_Objects/Function/bind#Compatibility
     */
    if (!Function.prototype.bind) {
        Function.prototype.bind = function (oThis) {
            if (typeof this !== "function") {
                // closest thing possible to the ECMAScript 5 internal
                // IsCallable function
                throw new TypeError("Function.prototype.bind - what is trying to be bound is not callable");
            }
    
            let aArgs = Array.prototype.slice.call(arguments, 1), 
                    fToBind = this, 
                    fNOP = function () {},
                    fBound = function () {
                        return fToBind.apply(this instanceof fNOP
                             ? this
                             : oThis || window,
                             aArgs.concat(Array.prototype.slice.call(arguments)));
                    };
    
            fNOP.prototype = this.prototype;
            fBound.prototype = new fNOP();
    
            return fBound;
        };
    }
    
    return Scratcher;
    
    })();
    
    
