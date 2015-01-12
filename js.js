/* Constants. */
var SPOT_RADIUS = 10;
var HIGH_OPACITY = 0.7;
var LOW_OPACITY = 0.3;
var OPACITY_THRESHOLD = 0;
var RADIUS_BOOST = 20;
var NEW_PULSE_THRESHOLD = 1000;
var NUM_NOTES = 6;
var SOUND_STRENGTH = 0.2;

var page_to_logo_map = {
  '#main': '#logo1',
  '#music': '#logo2',
  '#code': '#logo3',
  '#bio': '#logo4'
}

/*
 * Fader
 * -----
 * Handles smooth fades between pages. Also handles initialization of main
 * page.
 */
function Fader()
{
  var this_fader = this;
  this.cur_page_id = '#main';
  this.cur_logo_id = '#logo1';

  /* Loads body. Sets non-main pages to invisible and sets window's
   * resize function to handle graphics panel dimensions. */
  this.load_body = function()
  {
    console.log('load_body');

    if (window.location.hash in page_to_logo_map) {
      this.cur_page_id = window.location.hash;
      this.cur_logo_id = page_to_logo_map[window.location.hash];
    }

    $('.aux').each(
      function()
      {
        if('#' + this.id != this_fader.cur_page_id + '_')
        {
          this.style.display = 'none';
        }
        else
        {
          this.style.display = 'block';
        }
      }
    );

    $('.logo').each(
      function()
      {
        if('#' + this.id != this_fader.cur_logo_id)
        {
          this.style.display = 'none';
        }
        else
        {
          this.style.display = 'block';
        }
        this.onclick = function()
        {
          this_fader.load_page('#main');
        }
      }
    );

    $(window).resize(
      function()
      {
        set_dims('#canvas');
      }
    );
    set_dims('#canvas');

    //Load each sound so there won't be a delay later
    for(var i = 0; i < NUM_NOTES; ++i)
    {
      var p = new Pulse(null, null, i, 0);
      // don't worry about cleaning up stray elements
    }
  }

  /* Fades to a different page. */
  this.load_page = function(page_id)
  {
    if (page_id == '')
    {
      page_id = '#main';
    }

    if(this.cur_page_id == page_id)
    {
      return;
    }

    window.location.hash = page_id;
    logo_id = page_to_logo_map[page_id];

    $(this.cur_page_id + '_').fadeOut();
    if(this.cur_logo_id != logo_id)
    {
      $(this.cur_logo_id).fadeOut();
    }
    $(page_id + '_').fadeIn();
    if(this.cur_logo_id != logo_id)
    {
      $(logo_id).fadeIn();
    }

    this.cur_page_id = page_id;
    this.cur_logo_id = logo_id;

    set_dims('#canvas');
  }
}

/*
 * PulseSpot
 * -----
 * Represents a single spot that can pulse.
 */
function PulseSpot(elem, pulse_canvas, note)
{
  var this_spot = this;
  this.elem = elem;
  this.pulse_canvas = pulse_canvas;
  this.note = note;
  this.last = 0;
  this.mouse_is_down = false;
  this.moving = false;
  this.point = {x: elem.getCenterX(), y: elem.getCenterY(), spot: this_spot};

  this.elem.addMouseDownListener(
    function(event_args)
    {
      this_spot.spot_down(event_args);
    }
  );
      
  this.elem.addMouseOverListener(
    function(event_args)
    {
      this_spot.spot_over(event_args);
    }
  );

  this.spot_over = function(event_args)
  {
    if(this_spot.pulse_canvas.moving_spot == null)
    {
      this_spot.spot_pulse(1.0);
    }
  }

  /* Take note that the mouse is down. Prepare to either move or delete
   * this spot by temporarily removing it from play. */
  this.spot_down = function(event_args)
  {
    this_spot.mouse_is_down = true;
    this_spot.pulse_canvas.moving_spot = this_spot;
    elem.getFill().setOpacity(LOW_OPACITY);
    this_spot.pulse_canvas.kdtree.remove(this_spot.point);
    --this_spot.pulse_canvas.num_spots;
  }

  /* Note that the spot has moved, and should thus not be deleted. */
  this.spot_move = function(event_args)
  {
    if(this_spot.mouse_is_down)
    {
      var x = event_args.getX();
      var y = event_args.getY();

      this_spot.moving = true;

      // Move the spot
      elem.setCenterX(x);
      elem.setCenterY(y);
    }
  }

  /* Either delete this spot or put it back into play in its new position,
   * depending on whether or not it moved. */
  this.spot_up = function(event_args)
  {
    this_spot.mouse_is_down = false;
    if(this_spot.moving)
    {
      elem.getFill().setOpacity(HIGH_OPACITY);
      this_spot.moving = false;
      this_spot.point.x = this_spot.elem.getCenterX();
      this_spot.point.y = this_spot.elem.getCenterY();
      this_spot.pulse_canvas.kdtree.insert(this_spot.point);
      ++this_spot.pulse_canvas.num_spots;
    }
    else
    {
      // Already removed from the kdTree on mouse down, so no need
      // to worry about that here.
      this_spot.pulse_canvas.panel.removeElement(elem);
    }
  }

  /* Create a pulse around this spot's current location. Causes both a
   * graphic and sonic pulse. */
  this.spot_pulse = function(strength)
  {
    // Create circle for pulse
    var circle = this_spot.pulse_canvas.panel.createCircle();
    circle.setCenterLocationXY(this_spot.elem.getCenterX(),
      this_spot.elem.getCenterY());
    circle.setRadius(SPOT_RADIUS);
    circle.getStroke().setColor(this_spot.pulse_canvas.get_color(note));
    circle.getFill().setOpacity(0);
    circle.setZIndex(0);

    // Create pulse object
    var p = new Pulse(circle, this_spot.pulse_canvas, this_spot.note,
      strength);
    this_spot.pulse_canvas.pulses.push(p);

    // Add pulse to canvas
    this_spot.pulse_canvas.panel.addElement(circle);

    // Set last pulse time
    this_spot.last = new Date().getTime();
  }
}

/*
 * Pulse
 * -----
 * A graphic and sonic pulse originating from a PulseSpot. Once created,
 * the pulse is independent from the PulseSpot that created it.
 */
function Pulse(elem, pulse_canvas, note, strength)
{
  var this_pulse = this;
  this.elem = elem;
  this.pulse_canvas = pulse_canvas;
  this.strength = strength;
  this.points = [];
  this.weight = strength;

  // Play sound
  try
  {
    this.sound = document.createElement('audio');
    this.sound.setAttribute('controls', 'controls');
    this.sound.setAttribute('style', 'display: none');

    this.sound.src = 'sound' + (note + 1) + '.wav';
    this.sound.autoplay = true;
    this.sound.loop = false;
    this.sound.volume = strength * SOUND_STRENGTH;
    
    document.body.appendChild(this.sound);
  }
  catch(err)
  {
    // Fail silently
  }
}

/*
 * PulseCanvas
 * -----
 * Keeps track of the entire canvas of pulsing spots. Keeps a kdTree
 * of spots and an array of pulses so that pulses may trigger other spots
 * to pulse.
 */
function PulseCanvas(panel)
{
  var this_pulse_canvas = this;
  this.panel = panel;
  this.pulses = [];
  this.moving_spot = null;
  this.distance_func = function(a, b)
  {
    return Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2);
  }
  this.kdtree = new kdTree([], this_pulse_canvas.distance_func, ['x', 'y']);
  this.num_spots = 0;

  this.animator = new jsgl.util.Animator();
  this.animator.setStartValue(0);
  this.animator.setEndValue(1);
  this.animator.setDuration(1);
  this.animator.addStepListener(
    function(t)
    {
      var pulses = this_pulse_canvas.pulses;
      var num_pulses = pulses.length;

      // Animate each pulse by one step.
      for(var i = num_pulses - 1; i >= 0; --i)
      {
        var p = this_pulse_canvas.pulses[i];
        var rad = p.elem.getRadius();
        var op = p.elem.getStroke().getOpacity();

        // Get rid of the pulse and its associated sound element when
        // its opacity reaches OPACITY_THRESHOLD.
        if(op <= OPACITY_THRESHOLD)
        {
          this_pulse_canvas.panel.removeElement(p.elem);
          try
          {
            document.body.removeChild(p.sound);
          }
          catch(err)
          {
            // Fail silently.
          }
          pulses.splice(i, 1);
        }
        else
        {
          p.elem.getStroke().setOpacity(op - 0.01);
          p.weight = Math.max(0, p.weight - 0.01);
          p.elem.setRadius(rad + p.strength * RADIUS_BOOST * SPOT_RADIUS / rad);

          // If there are spots on the screen (that aren't currently being
          // moved), and this pulse has the capacity to trigger another pulse,
          // check to see if any spots should be triggered.
          if(this_pulse_canvas.num_spots > 0 && p.weight > 0)
          {
            // Set max distance to radius squared, since our distance
            // function does not perform square root.
            var points = this_pulse_canvas.kdtree.nearest(
              {x: p.elem.getCenterX(), y: p.elem.getCenterY()},
              this_pulse_canvas.num_spots, Math.pow(p.elem.getRadius(), 2));

            // Keep track of the spots we have already made pulse, and
            // trigger only new additions to this list.
            if(points.length > p.points.length)
            {
              var max_point = this_pulse_canvas.find_max_point(points);
              if(max_point != null)
              {
                var s = max_point.spot;
                var cur_time = new Date().getTime();
                if(cur_time - s.last > NEW_PULSE_THRESHOLD)
                {
                  s.spot_pulse(p.weight);
                }
              }
            }
            p.points = points;
          }
        }
      }
      this_pulse_canvas.animator.rewind();
      this_pulse_canvas.animator.play();
    }
  );

  /* Finds the furthest spot in the array returned by the kdTree. */
  this.find_max_point = function(points)
  {
    var num_points = points.length;
    var max_point = null;
    var max_dist = 0;
    for(var i = 0; i < num_points; ++i)
    {
      if(points[i][1] > max_dist)
      {
        max_dist = points[i][1];
        max_point = points[i][0];
      }
    }

    return max_point;
  }
  
  this.panel.addMouseDownListener(
    function(event_args)
    {
      this_pulse_canvas.canvas_down(event_args);
    }
  );
  this.panel.addMouseUpListener(
    function(event_args)
    {
      this_pulse_canvas.canvas_up(event_args);
    }
  );
  this.panel.addMouseMoveListener(
    function(event_args)
    {
      this_pulse_canvas.canvas_move(event_args);
    }
  );

  this.canvas_down = function(event_args)
  {
    var x = event_args.getX();
    var y = event_args.getY();
    var source = event_args.getSourceElement();

    // Add a spot if the user clicks in empty space (or in the middle
    // of a pulse, but not on a spot).
    if(source == null || source.getFill().getOpacity() == 0)
    {
      var note = Math.floor(Math.random() * 6);
      var color = this_pulse_canvas.get_color(note);

      var circle = panel.createCircle();
      circle.setCenterLocationXY(x, y);
      circle.setRadius(10);
      circle.getStroke().setColor(color);
      circle.getFill().setColor(color);
      circle.getFill().setOpacity(HIGH_OPACITY);
      circle.setZIndex(1);

      var spot = new PulseSpot(circle, this_pulse_canvas, note);

      this_pulse_canvas.panel.addElement(circle);
      this_pulse_canvas.kdtree.insert(spot.point);
      ++this_pulse_canvas.num_spots;
    }
  }

  this.canvas_up = function(event_args)
  {
    if(this_pulse_canvas.moving_spot != null)
    {
      this_pulse_canvas.moving_spot.spot_up(event_args);
      this_pulse_canvas.moving_spot = null;
    }
  }

  this.canvas_move = function(event_args)
  {
    if(this.moving_spot != null)
    {
      this.moving_spot.spot_move(event_args);
    }
  }

  /* Assigns a color to each 'note' number. */
  this.get_color = function(note)
  {
    switch(note)
    {
    case 0:
      return 'rgb(255, 0, 0)';
    case 1:
      return 'rgb(255, 200, 0)';
    case 2:
      return 'rgb(255, 255, 0)';
    case 3:
      return 'rgb(0, 255, 0)';
    case 4:
      return 'rgb(48, 48, 255)';
    case 5:
    default:
      return 'rgb(255, 0, 255)';
    }
  }

  this.animator.play();
}

/* Sets the dimensions of the specified elements such that they take up
 * the remainder of the window. */
function set_dims(jquery_id)
{
  var jquery_item = $(jquery_id);
  jquery_item.width(window.innerWidth - jquery_item.offset().left - 20);
  jquery_item.height(window.innerHeight - jquery_item.offset().top - 20);
}

